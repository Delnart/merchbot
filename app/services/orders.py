from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import CartItem, Order, OrderItem, OrderStatus, Product, UserProfile, DeliveryMethod

async def create_order_from_cart(
    session: AsyncSession,
    telegram_id: int,
    phone: str,
    address: str,
    receipt_photo_id: str,
    currency: str,
    delivery_method: str | None = None
) -> Order:
    user_query = select(UserProfile).where(UserProfile.telegram_id == telegram_id)
    user_result = await session.execute(user_query)
    user = user_result.scalar_one_or_none()
    if user is None:
        raise ValueError("user_not_found")

    cart_query = select(CartItem, Product).join(Product, Product.id == CartItem.product_id).where(CartItem.telegram_id == telegram_id)
    cart_result = await session.execute(cart_query)
    rows = list(cart_result.tuples().all())
    if not rows:
        raise ValueError("empty_cart")

    method_enum = DeliveryMethod(delivery_method) if delivery_method else None

    total = Decimal("0")
    order = Order(
        telegram_id=telegram_id,
        status=OrderStatus.pending,
        delivery_method=method_enum,
        phone=phone,
        address=address,
        receipt_photo_id=receipt_photo_id,
        total_amount=Decimal("0"),
        currency=currency,
    )
    session.add(order)
    await session.flush()

    for item, product in rows:
        line_total = Decimal(str(item.price)) * item.quantity
        total += line_total
        session.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                title=product.title,
                size=item.size,
                color=item.color,
                unit_price=item.price,
                quantity=item.quantity,
            )
        )

    order.total_amount = total
    for item, _ in rows:
        await session.delete(item)
    await session.flush()
    return order

async def get_order(session: AsyncSession, order_id: int) -> Order | None:
    result = await session.execute(select(Order).where(Order.id == order_id))
    return result.scalar_one_or_none()

async def set_order_status(session: AsyncSession, order: Order, status: OrderStatus) -> None:
    order.status = status
    await session.flush()

async def set_order_admin_message(session: AsyncSession, order: Order, message_id: int) -> None:
    order.admin_message_id = message_id
    await session.flush()

async def delete_all_orders(session: AsyncSession) -> None:
    from sqlalchemy import delete
    await session.execute(delete(Order))
    await session.flush()