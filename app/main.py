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


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await init_db()
    except Exception as e:
        print(f"Error during init_db: {e}")
    yield


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

CORS_ORIGINS = [
    "https://web.telegram.org",
    settings.app_base_url,
    settings.webapp_url,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in CORS_ORIGINS if origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webapp_router)

@app.get("/")
async def root_redirect():
    return RedirectResponse(url=settings.resolved_webapp_url)

@app.get("/health")
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
    await dp.feed_update(bot=bot, update=update)
    return JSONResponse({"ok": True})
