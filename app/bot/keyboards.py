from aiogram.types import InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder
from app.config import settings
from app.db.models import OrderStatus


def main_menu_keyboard() -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    webapp_url = f"{settings.app_base_url.rstrip('/')}/webapp/index.html"
    b.button(text="🛍 Відкрити каталог", web_app=WebAppInfo(url=webapp_url))
    b.adjust(1)
    return b.as_markup()


def persistent_main_keyboard() -> ReplyKeyboardMarkup:
    b = ReplyKeyboardBuilder()
    webapp_url = f"{settings.app_base_url.rstrip('/')}/webapp/index.html"
    b.button(text="🛍 Відкрити каталог", web_app=WebAppInfo(url=webapp_url))
    b.button(text="💬 Підтримка")
    b.adjust(2)
    return b.as_markup(resize_keyboard=True)


def admin_main_keyboard() -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    webapp_url = f"{settings.app_base_url.rstrip('/')}/webapp/index.html?page=admin"
    b.button(text="📦 Управління товарами", web_app=WebAppInfo(url=webapp_url))
    b.button(text="💰 Банка Monobank", callback_data="admin:set_mono")
    b.button(text="💳 Номер картки", callback_data="admin:set_card")
    b.button(text="✏️ Текст привітання", callback_data="admin:set_welcome")
    b.button(text="📢 Розсилка", callback_data="admin:broadcast")
    b.adjust(1)
    return b.as_markup()


def order_status_keyboard(order_id: int, current_status: OrderStatus, admin_name: str | None = None) -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    
    if current_status == OrderStatus.pending:
        b.button(text="🔄 Взяти в роботу", callback_data=f"ostatus:{order_id}:in_process")
        b.button(text="❌ Скасувати", callback_data=f"ostatus:{order_id}:cancelled")
    elif current_status == OrderStatus.in_process:
        if admin_name:
            b.button(text=f"👨‍💻 В роботі ({admin_name})", callback_data="ignore")
        b.button(text="✅ Виконано", callback_data=f"ostatus:{order_id}:completed")
        b.button(text="❌ Скасувати", callback_data=f"ostatus:{order_id}:cancelled")
    elif current_status == OrderStatus.completed:
        b.button(text="✅ Замовлення виконано", callback_data="ignore")
    elif current_status == OrderStatus.cancelled:
        b.button(text="❌ Замовлення скасовано", callback_data="ignore")
        
    b.adjust(1)
    return b.as_markup()