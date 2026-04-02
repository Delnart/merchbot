from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CartItem, Product, ProductSize, UserProfile


async def ensure_user(session: AsyncSession, telegram_id: int, username: str | None, first_name: str | None, last_name: str | None) -> UserProfile:
    result = await session.execute(select(UserProfile).where(UserProfile.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = UserProfile(telegram_id=telegram_id, username=username, first_name=first_name, last_name=last_name)
        session.add(user)
    else:
        user.username = username
        user.first_name = first_name
        user.last_name = last_name
    await session.flush()
    return user


async def add_to_cart(session: AsyncSession, telegram_id: int, product_id: int, size: str, color: str | None, quantity: int) -> None:
    size_query = select(ProductSize).where(ProductSize.product_id == product_id, ProductSize.size == size)
    size_result = await session.execute(size_query)
    size_line = size_result.scalar_one_or_none()
    if size_line is None:
        raise ValueError("size_not_found")

    line_query = select(CartItem).where(
        CartItem.telegram_id == telegram_id,
        CartItem.product_id == product_id,
        CartItem.size == size,
        CartItem.color == color,
    )
    line_result = await session.execute(line_query)
    line = line_result.scalar_one_or_none()
    if line is None:
        line = CartItem(
            telegram_id=telegram_id,
            product_id=product_id,
            size=size,
            color=color,
            price=Decimal(str(size_line.price)),
            quantity=quantity,
        )
        session.add(line)
    else:
        line.quantity += quantity
    await session.flush()


async def list_cart(session: AsyncSession, telegram_id: int) -> list[tuple[CartItem, Product]]:
    query = (
        select(CartItem, Product)
        .join(Product, Product.id == CartItem.product_id)
        .where(CartItem.telegram_id == telegram_id)
        .order_by(CartItem.id.asc())
    )
    result = await session.execute(query)
    return list(result.tuples().all())


async def clear_cart(session: AsyncSession, telegram_id: int) -> None:
    await session.execute(delete(CartItem).where(CartItem.telegram_id == telegram_id))
    await session.flush()
