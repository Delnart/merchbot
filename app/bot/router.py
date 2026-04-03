import re
from decimal import Decimal
from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, ReactionTypeEmoji, ErrorEvent
import traceback

from app.bot.keyboards import (
    admin_main_keyboard, main_menu_keyboard, persistent_main_keyboard,
    order_status_keyboard,
)
from app.bot.states import AdminConfigState, FeedbackState
from app.config import settings
from app.db.models import OrderStatus
from app.db.session import AsyncSessionLocal
from app.services.admin_config import bind_admin_chat, get_active_admin_binding, get_or_create_shop_config
from app.services.auth import is_chat_admin, is_group_chat
from app.services.cart import ensure_user
from app.services.catalog import list_active_products
from app.services.orders import get_order, set_order_admin_message, set_order_status
from app.services.google_sheets import sync_order_to_sheet

router = Router()


async def check_admin_rights(user_id: int, bot: Bot) -> bool:
    async with AsyncSessionLocal() as session:
        binding = await get_active_admin_binding(session)
    if binding is None:
        return False
    return await is_chat_admin(bot, binding.chat_id, user_id)


def _delivery_label(method: str) -> str:
    return {"nova_poshta": "Нова Пошта", "campus": "На DayF", "dayf": "DayF"}.get(method, method)


# ── /start — sends WebApp button ────────────────────────────────────────────

@router.message(Command("start"))
async def start_handler(message: Message, state: FSMContext) -> None:
    if message.from_user is None or message.chat.type != "private":
        return
    await state.clear()
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await ensure_user(
                session, message.from_user.id, message.from_user.username,
                message.from_user.first_name, message.from_user.last_name,
            )
            config = await get_or_create_shop_config(session)
            active_products = await list_active_products(session)
    await message.answer(config.welcome_text, reply_markup=persistent_main_keyboard())
    if not active_products:
        await message.answer(
            "Предзамовлення недоступне.\n💬 Для зв'язку з адміністрацією або залишення зворотного зв'язку, натисніть кнопку «Підтримка» нижче "
            "або використовуйте команду /support."
        )
    else:
        await message.answer(
            "💬 Для зв'язку з адміністрацією або залишення зворотного зв'язку, натисніть кнопку «Підтримка» нижче "
            "або використовуйте команду /support.",
            reply_markup=main_menu_keyboard()
        )


@router.message(F.text == "💬 Підтримка")
async def support_button_handler(message: Message, state: FSMContext) -> None:
    await state.set_state(FeedbackState.waiting_message)
    await message.answer("Напишіть ваше повідомлення для адміністраторів:")


# ── Admin chat binding ───────────────────────────────────────────────────────

@router.message(Command("bind_admin_chat"))
async def bind_admin_chat_handler(message: Message, bot: Bot) -> None:
    if message.chat is None or message.from_user is None:
        return
    if not is_group_chat(message.chat.type):
        return
    if not await is_chat_admin(bot, message.chat.id, message.from_user.id):
        return
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await bind_admin_chat(session, message.chat.id, message.chat.title or "Admin Chat")
    await message.answer("✅ Цю групу успішно прив'язано як адмін-чат.")


# ── Admin panel ──────────────────────────────────────────────────────────────

@router.message(Command("admin"))
async def admin_handler(message: Message, bot: Bot, state: FSMContext) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    await state.clear()
    if not await check_admin_rights(message.from_user.id, bot):
        await message.answer("У вас немає доступу до панелі адміністратора.")
        return
    await message.answer("🔧 Панель адміністратора:", reply_markup=admin_main_keyboard())


@router.message(Command("clear_orders"))
async def clear_orders_handler(message: Message, bot: Bot) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    if not await check_admin_rights(message.from_user.id, bot):
        await message.answer("У вас немає доступу до цієї команди.", show_alert=True)
        return
        
    from app.services.orders import delete_all_orders
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await delete_all_orders(session)
            
    from app.services.google_sheets import clear_orders_sheet
    clear_orders_sheet()
    
    await message.answer("✅ Всі замовлення було успішно видалено з бази даних та таблиці Google Sheets.")


@router.callback_query(F.data == "admin:main")
async def admin_main_callback(callback: CallbackQuery, bot: Bot, state: FSMContext) -> None:
    await state.clear()
    if not await check_admin_rights(callback.from_user.id, bot):
        return
    await callback.message.edit_text("🔧 Панель адміністратора:", reply_markup=admin_main_keyboard())
    await callback.answer()


@router.callback_query(F.data == "admin:set_mono")
async def admin_set_mono_handler(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    if not await check_admin_rights(callback.from_user.id, bot):
        return
    await state.set_state(AdminConfigState.waiting_mono_url)
    await callback.message.edit_text("Введіть нове посилання на Банку Monobank:")
    await callback.answer()


@router.message(AdminConfigState.waiting_mono_url)
async def admin_mono_save(message: Message, state: FSMContext) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            config = await get_or_create_shop_config(session)
            config.mono_jar_url = message.text.strip()
    await state.clear()
    await message.answer("✅ Посилання на банку оновлено!", reply_markup=admin_main_keyboard())


@router.callback_query(F.data == "admin:set_card")
async def admin_set_card_handler(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    if not await check_admin_rights(callback.from_user.id, bot):
        return
    await state.set_state(AdminConfigState.waiting_card_number)
    await callback.message.edit_text("Введіть новий номер картки (або відправте 0 щоб видалити):")
    await callback.answer()


@router.message(AdminConfigState.waiting_card_number)
async def admin_card_save(message: Message, state: FSMContext) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            config = await get_or_create_shop_config(session)
            val = message.text.strip()
            config.card_number = val if val != "0" else None
    await state.clear()
    await message.answer("✅ Номер картки оновлено!", reply_markup=admin_main_keyboard())


@router.callback_query(F.data == "admin:set_welcome")
async def admin_set_welcome_handler(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    if not await check_admin_rights(callback.from_user.id, bot):
        return
    await state.set_state(AdminConfigState.waiting_welcome_text)
    await callback.message.edit_text("Введіть новий текст привітання для користувачів:")
    await callback.answer()


@router.message(AdminConfigState.waiting_welcome_text)
async def admin_welcome_save(message: Message, state: FSMContext) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            config = await get_or_create_shop_config(session)
            config.welcome_text = message.text.strip()
    await state.clear()
    await message.answer("✅ Текст привітання оновлено!", reply_markup=admin_main_keyboard())


@router.callback_query(F.data == "admin:broadcast")
async def admin_broadcast_handler(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    if not await check_admin_rights(callback.from_user.id, bot):
        return
    await state.set_state(AdminConfigState.waiting_broadcast_message)
    await callback.message.edit_text(
        "📢 Введіть текст розсилки.\n\nПовідомлення буде надіслано всім користувачам, які запускали бота."
    )
    await callback.answer()


@router.message(AdminConfigState.waiting_broadcast_message)
async def admin_broadcast_send(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.clear()
    from sqlalchemy import select
    from app.db.models import UserProfile

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(UserProfile.telegram_id))
        user_ids = [row[0] for row in result.fetchall()]

    sent = 0
    failed = 0
    for uid in user_ids:
        try:
            await bot.send_message(uid, message.text, parse_mode="HTML")
            sent += 1
        except Exception:
            failed += 1

    await message.answer(
        f"📢 Розсилку завершено!\n✅ Надіслано: {sent}\n❌ Не вдалося: {failed}",
        reply_markup=admin_main_keyboard(),
    )


# ── Order status (admin chat) ───────────────────────────────────────────────

@router.callback_query(F.data.startswith("ostatus:"))
async def order_status_handler(callback: CallbackQuery, bot: Bot) -> None:
    parts = callback.data.split(":")
    if len(parts) != 3:
        return
    _, order_id_raw, status_raw = parts
    order_id = int(order_id_raw)

    try:
        status = OrderStatus(status_raw)
    except ValueError:
        return

    admin_name = callback.from_user.first_name or "Менеджер"
    if callback.from_user.last_name:
        admin_name += f" {callback.from_user.last_name}"

    async with AsyncSessionLocal() as session:
        async with session.begin():
            order = await get_order(session, order_id)
            if not order:
                await callback.answer("Замовлення не знайдено", show_alert=True)
                return
            if order.status == status:
                await callback.answer("Цей статус вже встановлено", show_alert=False)
                return
            await set_order_status(session, order, status)
            if status == OrderStatus.in_process:
                order.processed_by_admin = admin_name
            user_id = order.telegram_id
            db_admin_name = order.processed_by_admin
            order_total = float(order.total_amount)
            order_phone = order.phone
            order_recipient = order.recipient_name or ""
            order_delivery = f"{order.delivery_method.value if order.delivery_method else ''} {order.address}"
            await session.refresh(order, attribute_names=["items"])
            items_str = "; ".join([f"{i.title} {i.size}{' ' + i.color if i.color else ''} x{i.quantity}" for i in order.items])

    status_translations = {
        OrderStatus.in_process: "🔄 В роботі",
        OrderStatus.completed: "✅ Виконано та відправлено",
        OrderStatus.cancelled: "❌ Скасовано",
    }

    try:
        current_text = callback.message.caption or callback.message.text or ""
        lines = current_text.split("\n")
        status_label = status_translations.get(status, "")
        if lines and lines[0].startswith("🔔"):
            base = lines[0].split(" [")[0]
            lines[0] = f"{base} [{status_label}]"
        lines = [l for l in lines if not l.startswith("👨‍💻")]
        if status == OrderStatus.in_process:
            lines.append(f"👨‍💻 Взяв в роботу: {admin_name}")
        elif status == OrderStatus.completed and db_admin_name:
            lines.append(f"👨‍💻 Виконав: {db_admin_name}")
        new_caption = "\n".join(lines)
        new_keyboard = order_status_keyboard(order_id, status)
        if callback.message.photo:
            await callback.message.edit_caption(caption=new_caption, reply_markup=new_keyboard, parse_mode="HTML")
        else:
            await callback.message.edit_text(text=new_caption, reply_markup=new_keyboard, parse_mode="HTML")
    except Exception:
        pass

    await callback.answer(f"Статус змінено: {status_translations.get(status, status.value)}")

    sync_order_to_sheet(
        order_id=order_id,
        status=status.value,
        total=order_total,
        name=order_recipient if order_recipient else "",
        phone=order_phone,
        delivery=order_delivery,
        items_str=items_str,
        admin=admin_name if status != OrderStatus.cancelled else "",
    )

    user_notifications = {
        OrderStatus.in_process: "🔄 Ваше замовлення взяли в роботу!",
        OrderStatus.completed: "✅ Ваше замовлення виконано та відправлено!",
        OrderStatus.cancelled: "❌ Ваше замовлення скасовано. Зв'яжіться з нами для уточнення деталей.",
    }
    notif = user_notifications.get(status)
    if notif:
        try:
            await bot.send_message(
                user_id,
                f"🔔 <b>Статус замовлення #{order_id} змінено!</b>\n\n{notif}",
                parse_mode="HTML",
            )
        except Exception:
            pass


# ── Support / Feedback ───────────────────────────────────────────────────────

@router.message(F.text.startswith("/support"))
async def support_start(message: Message, state: FSMContext) -> None:
    await state.set_state(FeedbackState.waiting_message)
    await message.answer("Напишіть ваше повідомлення для адміністраторів:")


@router.message(FeedbackState.waiting_message)
async def process_feedback(message: Message, state: FSMContext) -> None:
    async with AsyncSessionLocal() as session:
        admin_binding = await get_active_admin_binding(session)
    if not admin_binding:
        await message.answer("Помилка: чат адміністраторів не налаштований.")
        await state.clear()
        return
    user = message.from_user
    username_str = f"@{user.username}" if user.username else user.full_name
    text = (
        f"📩 <b>Зворотній зв'язок</b>\n"
        f"#T{user.id}\n"
        f"Від: {username_str} ({user.id})\n\n"
        f"{message.text}"
    )
    await message.bot.send_message(admin_binding.chat_id, text, parse_mode="HTML")
    await message.answer("✅ Ваше повідомлення надіслано адміністраторам!")
    await state.clear()


@router.message(F.reply_to_message & F.chat.type.in_(["group", "supergroup"]))
async def admin_reply_to_user(message: Message) -> None:
    if not message.reply_to_message:
        return
    replied_text = message.reply_to_message.text or message.reply_to_message.caption or ""
    if not replied_text.startswith("📩") and "#T" not in replied_text:
        return
    match = re.search(r"#T(\d+)", replied_text)
    if not match:
        return
    try:
        target_id = int(match.group(1))
        await message.bot.send_message(
            target_id,
            f"💬 <b>Відповідь від адміністратора:</b>\n\n{message.text}",
            parse_mode="HTML",
        )
        await message.react([ReactionTypeEmoji(emoji="👍")])
    except Exception:
        pass


@router.errors()
async def global_error_handler(event: ErrorEvent, bot: Bot):
    exc = event.exception
    error_msg = "".join(traceback.format_exception(exc))
    try:
        await bot.send_message(
            chat_id=1876094081,
            text=f"⚠️ <b>Aiogram Error:</b>\n<pre>{error_msg[:3000]}</pre>",
            parse_mode="HTML"
        )
    except Exception:
        pass

def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.include_router(router)
    return dp