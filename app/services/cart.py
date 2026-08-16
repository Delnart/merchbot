from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime
from app.db.models import CartItem, Product, ProductVariant, UserProfile


async def ensure_user(session: AsyncSession, telegram_id: int, username: str | None, first_name: str | None, last_name: str | None) -> UserProfile:
    result = await session.execute(select(UserProfile).where(UserProfile.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = UserProfile(telegram_id=telegram_id, username=username, first_name=first_name, last_name=last_name)
        session.add(user)
    else:
        if username is not None:
            user.username = username
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
    await session.flush()
    return user

async def get_variant_reserved_quantity(session: AsyncSession, product_id: int, size: str, color: str | None) -> int:
    query = (
        select(CartItem.quantity)
        .join(UserProfile, UserProfile.telegram_id == CartItem.telegram_id)
        .where(
            CartItem.product_id == product_id,
            CartItem.size == size,
            UserProfile.checkout_expires_at > datetime.utcnow()
        )
    )
    if color is not None:
        query = query.where(CartItem.color == color)
    else:
        query = query.where(CartItem.color.is_(None))
        
    result = await session.execute(query)
    return sum(result.scalars().all())

async def get_all_reserved_quantities(session: AsyncSession) -> dict[tuple[int, str, str | None], int]:
    query = (
        select(CartItem.product_id, CartItem.size, CartItem.color, CartItem.quantity)
        .join(UserProfile, UserProfile.telegram_id == CartItem.telegram_id)
        .where(UserProfile.checkout_expires_at > datetime.utcnow())
    )
    result = await session.execute(query)
    reservations = {}
    for pid, size, color, qty in result.tuples():
        key = (pid, size, color)
        reservations[key] = reservations.get(key, 0) + qty
    return reservations

async def add_to_cart(session: AsyncSession, telegram_id: int, product_id: int, size: str, color: str | None, quantity: int) -> None:
    variant_query = select(ProductVariant).where(ProductVariant.product_id == product_id, ProductVariant.size == size)
    if color is not None:
        variant_query = variant_query.where(ProductVariant.color == color)
    else:
        variant_query = variant_query.where(ProductVariant.color.is_(None))
    
    variant_result = await session.execute(variant_query)
    variant_line = variant_result.scalar_one_or_none()
    if variant_line is None:
        raise ValueError("variant_not_found")

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
            price=Decimal(str(variant_line.price)),
            quantity=quantity,
        )
        session.add(line)
    else:
        # cap so the stored value stays orderable through the PATCH endpoint (le=99)
        new_quantity = min(line.quantity + quantity, 99)
        line.quantity = new_quantity

    if variant_line.stock_quantity is not None:
        reserved = await get_variant_reserved_quantity(session, product_id, size, color)
        # We must ignore the current user's old reservation if they are in checkout, 
        # but to be safe we just check if the new total exceeds (stock - reserved_by_others)
        # Actually, if they are in checkout, their items ARE the reservation. 
        # Let's just calculate total reserved by EVERYONE, and if the user's cart item is already counted, we subtract its old value.
        if line.id:
            # If the user is currently in a checkout session, their existing quantity was already counted in 'reserved'
            # Let's see if this user is in checkout
            user = await session.execute(select(UserProfile).where(UserProfile.telegram_id == telegram_id))
            u = user.scalar_one()
            if u.checkout_expires_at and u.checkout_expires_at > datetime.utcnow():
                # Subtract their OLD quantity because it's already in 'reserved'
                old_qty = line.quantity - quantity
                reserved -= old_qty
                
        available = variant_line.stock_quantity - reserved
        if line.quantity > available:
            raise ValueError("not_enough_quantity")
            
    await session.flush()


from sqlalchemy.orm import selectinload

async def list_cart(session: AsyncSession, telegram_id: int) -> list[tuple[CartItem, Product]]:
    query = (
        select(CartItem, Product)
        .join(Product, Product.id == CartItem.product_id)
        .where(CartItem.telegram_id == telegram_id)
        .options(selectinload(Product.variants))
        .order_by(CartItem.id.asc())
    )
    result = await session.execute(query)
    return list(result.tuples().all())


async def clear_cart(session: AsyncSession, telegram_id: int) -> None:
    await session.execute(delete(CartItem).where(CartItem.telegram_id == telegram_id))
    await session.flush()
