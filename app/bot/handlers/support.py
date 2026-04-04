import re

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, ReactionTypeEmoji

from app.bot.states import FeedbackState
from app.db.session import AsyncSessionLocal
from app.services.admin_config import get_active_admin_binding
from app.services.auth import is_chat_admin

router = Router()

support_reply_targets: dict[int, int] = {}


async def send_feedback_message(message: Message, target_id: int, text: str | None = None):
    try:
        if text:
            await message.bot.send_message(target_id, text)
        if any([message.photo, message.document, message.video, message.audio, message.voice, message.sticker, message.animation]):
            await message.bot.copy_message(
                chat_id=target_id,
                from_chat_id=message.chat.id,
                message_id=message.message_id,
            )
        elif not text:
            await message.bot.send_message(target_id, message.text or "(порожнє повідомлення)")
    except Exception:
        pass


@router.message(F.text.startswith("/support"))
async def support_start(message: Message, state: FSMContext) -> None:
    await state.set_state(FeedbackState.waiting_message)
    await message.answer("Напишіть ваше повідомлення для адміністраторів (можна прикріпити фото):")


@router.message(FeedbackState.waiting_message)
async def process_feedback(message: Message, state: FSMContext) -> None:
    async with AsyncSessionLocal() as session:
        admin_binding = await get_active_admin_binding(session)
    if not admin_binding:
        await message.answer("Помилка: чат адміністраторів не налаштований.")
        await state.clear()
        return
    if message.from_user is None:
        return

    user = message.from_user
    username_str = f"@{user.username}" if user.username else user.full_name
    text = (
        "📩 Зворотній зв'язок\n"
        f"#T{user.id}\n"
        f"Від: {username_str} ({user.id})\n\n"
        f"{message.text or message.caption or '(без тексту)'}"
    )

    meta_msg = await message.bot.send_message(admin_binding.chat_id, text)
    support_reply_targets[meta_msg.message_id] = user.id
    try:
        copied = await message.bot.copy_message(
            chat_id=admin_binding.chat_id,
            from_chat_id=message.chat.id,
            message_id=message.message_id,
            reply_to_message_id=meta_msg.message_id,
        )
        support_reply_targets[copied.message_id] = user.id
    except Exception:
        pass
    if len(support_reply_targets) > 3000:
        support_reply_targets.clear()

    current_state = await state.get_state()
    if current_state:
        await message.answer("✅ Ваше повідомлення надіслано адміністраторам!")
        await state.set_state(None)


@router.message(F.reply_to_message & F.chat.type.in_(["group", "supergroup"]))
async def admin_reply_to_user(message: Message) -> None:
    if not message.reply_to_message:
        return
    if message.from_user is None:
        return

    async with AsyncSessionLocal() as session:
        binding = await get_active_admin_binding(session)
    if binding is None or message.chat.id != binding.chat_id:
        return
    if not await is_chat_admin(message.bot, message.chat.id, message.from_user.id):
        return

    try:
        target_id = support_reply_targets.get(message.reply_to_message.message_id)
        if target_id is None:
            replied_text = message.reply_to_message.text or message.reply_to_message.caption or ""
            match = re.search(r"#T(\d+)", replied_text)
            if match:
                target_id = int(match.group(1))
        if target_id is None:
            return

        out_text = f"💬 Відповідь від адміністратора:\n\n{message.text or message.caption or '(без тексту)'}"
        await send_feedback_message(message, target_id, out_text)
        await message.react([ReactionTypeEmoji(emoji="👍")])
    except Exception:
        pass


@router.message(F.reply_to_message & (F.chat.type == "private"))
async def user_reply_to_admin(message: Message) -> None:
    if not message.reply_to_message or message.reply_to_message.from_user is None:
        return
    if message.reply_to_message.from_user.id != message.bot.id:
        return

    replied_text = message.reply_to_message.text or message.reply_to_message.caption or ""
    if "Відповідь від адміністратора" not in replied_text and "Ваше повідомлення надіслано" not in replied_text:
        return

    async with AsyncSessionLocal() as session:
        admin_binding = await get_active_admin_binding(session)
    if not admin_binding:
        await message.answer("Помилка: чат адміністраторів не налаштований.")
        return
    if message.from_user is None:
        return

    user = message.from_user
    username_str = f"@{user.username}" if user.username else user.full_name
    text = (
        "📩 Відповідь від користувача\n"
        f"#T{user.id}\n"
        f"Від: {username_str} ({user.id})\n\n"
        f"{message.text or message.caption or '(без тексту)'}"
    )

    meta_msg = await message.bot.send_message(admin_binding.chat_id, text)
    support_reply_targets[meta_msg.message_id] = user.id
    try:
        copied = await message.bot.copy_message(
            chat_id=admin_binding.chat_id,
            from_chat_id=message.chat.id,
            message_id=message.message_id,
            reply_to_message_id=meta_msg.message_id,
        )
        support_reply_targets[copied.message_id] = user.id
    except Exception:
        pass
    if len(support_reply_targets) > 3000:
        support_reply_targets.clear()

    await message.answer("✅ Ваше повідомлення надіслано адміністраторам!")
