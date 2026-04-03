from aiogram import Bot


def is_group_chat(chat_type: str) -> bool:
    return chat_type in {"group", "supergroup"}


async def is_chat_admin(bot: Bot, chat_id: int, user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id=chat_id, user_id=user_id)
        return member.status in {"administrator", "creator"}
    except Exception:
        return False
