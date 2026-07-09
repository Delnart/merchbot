import asyncio
import traceback
from contextlib import asynccontextmanager
from html import escape

from aiogram import Bot
from aiogram.types import Update
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.bot.router import build_dispatcher
from app.config import settings
from app.db.init_db import init_db
from app.webapp_api import router as webapp_router


bot = Bot(token=settings.bot_token)
dp = build_dispatcher()

KEEP_ALIVE_INTERVAL_SECONDS = 600  # under Render's 15-min idle spin-down


async def _keep_alive_loop() -> None:
    """Ping our own public /health URL so Render never spins the service down."""
    from app.webapp_api import get_http_session

    url = f"{settings.app_base_url.rstrip('/')}/health"
    while True:
        await asyncio.sleep(KEEP_ALIVE_INTERVAL_SECONDS)
        try:
            http = await get_http_session()
            async with http.get(url) as resp:
                await resp.read()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await init_db()
    except Exception as e:
        print(f"Error during init_db: {e}")

    keep_alive_task: asyncio.Task | None = None
    if settings.keep_alive_enabled and settings.app_base_url.startswith("https://"):
        keep_alive_task = asyncio.create_task(_keep_alive_loop())

    yield

    if keep_alive_task is not None:
        keep_alive_task.cancel()
    # Let in-flight order notifications / sheet syncs finish before
    # tearing down the HTTP session and DB engine they depend on
    from app.services.background import drain_background_tasks
    await drain_background_tasks(timeout=10.0)
    import app.webapp_api as webapp_api
    if webapp_api._http_session is not None and not webapp_api._http_session.closed:
        await webapp_api._http_session.close()
    from app.db.session import engine
    await engine.dispose()


app = FastAPI(lifespan=lifespan)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = "".join(traceback.format_exception(exc))
    if settings.error_report_chat_id:
        try:
            await bot.send_message(
                chat_id=settings.error_report_chat_id,
                text=f"FastAPI error:\n{escape(error_msg[:3500])}",
            )
        except Exception:
            pass
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# Auth is a signed X-Telegram-Init-Data header (HMAC), never cookies, so a
# wildcard origin is safe and — unlike an allow-list — never breaks when the
# frontend's URL changes. The initData validation is the real security boundary.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webapp_router)

@app.get("/")
async def root_redirect():
    return RedirectResponse(url=settings.resolved_webapp_url)

@app.api_route("/health", methods=["GET", "HEAD"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/setup/webhook")
async def setup_webhook() -> dict[str, str | bool]:
    await init_db()
    base_url = settings.app_base_url.rstrip("/")
    await bot.set_webhook(
        url=f"{base_url}/webhook/telegram",
        secret_token=settings.webhook_secret,
        allowed_updates=["message", "callback_query"],
    )
    return {"ok": True, "message": "Database initialized and webhook set."}


@app.post("/webhook/telegram")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    if x_telegram_bot_api_secret_token != settings.webhook_secret:
        raise HTTPException(status_code=401, detail="unauthorized")
    data = await request.json()
    update = Update.model_validate(data, context={"bot": bot})
    # Await so Telegram delivers the next update for this chat only after this
    # one is handled — preserves FSM ordering. All handlers are fast now
    # (broadcast/sheets/notifications run in the background).
    await dp.feed_update(bot=bot, update=update)
    return JSONResponse({"ok": True})
