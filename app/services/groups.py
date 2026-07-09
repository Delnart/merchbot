import re

from sqlalchemy import delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Product, ProductVisibility, UserGroup, UserGroupMember


def _normalize_username(value: str) -> str:
    return value.lstrip("@").strip().lower()


def parse_member_values(raw: str) -> list[tuple[int | None, str | None]]:
    """Parse a raw string of members separated by commas/whitespace/newlines.

    Each entry is either a numeric telegram id or a @username.
    Returns list of (telegram_id, username) tuples.
    """
    entries: list[tuple[int | None, str | None]] = []
    seen: set[str] = set()
    for chunk in re.split(r"[\s,;]+", raw):
        value = chunk.strip()
        if not value:
            continue
        if re.fullmatch(r"\d{1,19}", value):
            telegram_id = int(value)
            if telegram_id > 2**63 - 1:  # BIGINT column bound
                continue
            key = f"id:{value}"
            if key in seen:
                continue
            seen.add(key)
            entries.append((telegram_id, None))
        else:
            username = _normalize_username(value)
            # Telegram usernames: 5-32 chars, start with a letter
            if not re.fullmatch(r"[a-z][a-z0-9_]{4,31}", username):
                continue
            key = f"un:{username}"
            if key in seen:
                continue
            seen.add(key)
            entries.append((None, username))
    return entries


async def list_groups(session: AsyncSession) -> list[UserGroup]:
    result = await session.execute(
        select(UserGroup).options(selectinload(UserGroup.members)).order_by(UserGroup.id.asc())
    )
    return list(result.scalars().all())


async def get_group(session: AsyncSession, group_id: int) -> UserGroup | None:
    result = await session.execute(
        select(UserGroup).options(selectinload(UserGroup.members)).where(UserGroup.id == group_id)
    )
    return result.scalar_one_or_none()


async def create_group(session: AsyncSession, name: str) -> UserGroup:
    group = UserGroup(name=name.strip())
    session.add(group)
    await session.flush()
    return group


async def delete_group(session: AsyncSession, group_id: int) -> tuple[bool, int]:
    """Delete a group. Returns (deleted, archived_product_count).

    Products restricted ONLY to this group would silently become visible to
    everyone once the cascade removes their last visibility row — archive
    them instead so an admin has to consciously re-publish them.
    """
    result = await session.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalar_one_or_none()
    if group is None:
        return False, 0

    restricted_to_this = exists(
        select(ProductVisibility.id).where(
            ProductVisibility.product_id == Product.id,
            ProductVisibility.group_id == group_id,
        )
    )
    restricted_to_other = exists(
        select(ProductVisibility.id).where(
            ProductVisibility.product_id == Product.id,
            ProductVisibility.group_id != group_id,
        )
    )
    orphaned_result = await session.execute(
        select(Product).where(Product.is_active.is_(True), restricted_to_this, ~restricted_to_other)
    )
    orphaned = list(orphaned_result.scalars().all())
    for product in orphaned:
        product.is_active = False

    # SQLite dev DBs don't enforce FK cascades — remove visibility rows explicitly
    await session.execute(delete(ProductVisibility).where(ProductVisibility.group_id == group_id))
    await session.delete(group)
    await session.flush()
    return True, len(orphaned)


async def add_members(session: AsyncSession, group: UserGroup, raw_values: str) -> int:
    entries = parse_member_values(raw_values)
    if not entries:
        return 0
    result = await session.execute(
        select(UserGroupMember).where(UserGroupMember.group_id == group.id)
    )
    current = list(result.scalars().all())
    existing_ids = {m.telegram_id for m in current if m.telegram_id is not None}
    existing_usernames = {m.username for m in current if m.username}
    added = 0
    for telegram_id, username in entries:
        if telegram_id is not None and telegram_id in existing_ids:
            continue
        if username is not None and username in existing_usernames:
            continue
        session.add(UserGroupMember(group_id=group.id, telegram_id=telegram_id, username=username))
        added += 1
    await session.flush()
    return added


async def remove_member(session: AsyncSession, group_id: int, member_id: int) -> bool:
    result = await session.execute(
        select(UserGroupMember).where(UserGroupMember.id == member_id, UserGroupMember.group_id == group_id)
    )
    member = result.scalar_one_or_none()
    if member is None:
        return False
    await session.delete(member)
    await session.flush()
    return True


async def get_user_group_ids(session: AsyncSession, telegram_id: int, username: str | None) -> set[int]:
    """Group ids the user belongs to, matched by telegram id or username."""
    conditions = [UserGroupMember.telegram_id == telegram_id]
    if username:
        conditions.append(func.lower(UserGroupMember.username) == _normalize_username(username))
    result = await session.execute(select(UserGroupMember.group_id).where(or_(*conditions)).distinct())
    return {row[0] for row in result.all()}


def visibility_filter(group_ids: set[int]):
    """SQL condition: product has no visibility restrictions OR one matches the user's groups."""
    unrestricted = ~exists(
        select(ProductVisibility.id).where(ProductVisibility.product_id == Product.id)
    )
    if not group_ids:
        return unrestricted
    allowed = exists(
        select(ProductVisibility.id).where(
            ProductVisibility.product_id == Product.id,
            ProductVisibility.group_id.in_(group_ids),
        )
    )
    return or_(unrestricted, allowed)


async def can_user_see_product(
    session: AsyncSession, product_id: int, telegram_id: int, username: str | None
) -> bool:
    result = await session.execute(
        select(ProductVisibility.group_id).where(ProductVisibility.product_id == product_id)
    )
    restricted_to = {row[0] for row in result.all()}
    if not restricted_to:
        return True
    user_groups = await get_user_group_ids(session, telegram_id, username)
    return bool(restricted_to & user_groups)


async def set_product_groups(session: AsyncSession, product_id: int, group_ids: list[int]) -> None:
    await session.execute(delete(ProductVisibility).where(ProductVisibility.product_id == product_id))
    unique_ids = sorted(set(group_ids))
    if unique_ids:
        result = await session.execute(select(UserGroup.id).where(UserGroup.id.in_(unique_ids)))
        valid_ids = {row[0] for row in result.all()}
        for gid in unique_ids:
            if gid in valid_ids:
                session.add(ProductVisibility(product_id=product_id, group_id=gid))
    await session.flush()


async def get_product_group_ids(session: AsyncSession, product_ids: list[int]) -> dict[int, list[int]]:
    if not product_ids:
        return {}
    result = await session.execute(
        select(ProductVisibility.product_id, ProductVisibility.group_id).where(
            ProductVisibility.product_id.in_(product_ids)
        )
    )
    mapping: dict[int, list[int]] = {}
    for product_id, group_id in result.all():
        mapping.setdefault(product_id, []).append(group_id)
    return mapping
