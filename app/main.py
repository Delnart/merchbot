import os
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

from aiogram import Bot
from aiogram.types import Update
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.bot.router import build_dispatcher
from app.config import settings
from app.db.init_db import init_db
from app.webapp_api import router as webapp_router


bot = Bot(token=settings.bot_token)
dp = build_dispatcher()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = "".join(traceback.format_exception(exc))
    try:
        await bot.send_message(
            chat_id=1876094081,
            text=f"⚠️ <b>FastAPI Error:</b>\n<pre>{error_msg[:3000]}</pre>",
            parse_mode="HTML"
        )
    except Exception:
        pass
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webapp_router)

# Mount static files for the Mini App
webapp_dir = Path(__file__).resolve().parent.parent / "webapp"
if webapp_dir.is_dir():
    app.mount("/webapp", StaticFiles(directory=str(webapp_dir), html=True), name="webapp")


from fastapi.responses import JSONResponse, RedirectResponse

@app.get("/")
async def root_redirect():
    return RedirectResponse(url="/webapp/index.html")

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/setup/webhook")
async def setup_webhook() -> dict[str, str | bool]:
    await init_db()
    await bot.set_webhook(
        url=f"{settings.app_base_url}/webhook/telegram",
        secret_token=settings.webhook_secret,
        allowed_updates=["message", "callback_query"],
    )
    return {"ok": True, "message": "Database initialized and webhook set."}


@app.get("/setup/delete_webhook")
async def delete_webhook() -> dict[str, bool]:
    await bot.delete_webhook(drop_pending_updates=False)
    return {"ok": True}


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
