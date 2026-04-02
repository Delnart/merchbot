from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Product, ProductSize


async def create_product(session: AsyncSession, title: str, description: str, requires_color: bool = False) -> Product:
    product = Product(title=title, description=description, requires_color=requires_color)
    session.add(product)
    await session.flush()
    return product


async def get_product(session: AsyncSession, product_id: int) -> Product | None:
    result = await session.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()


async def list_active_products(session: AsyncSession) -> list[Product]:
    result = await session.execute(select(Product).where(Product.is_active.is_(True)).order_by(Product.id.desc()))
    return list(result.scalars().all())


async def list_all_products(session: AsyncSession) -> list[Product]:
    result = await session.execute(select(Product).order_by(Product.id.desc()))
    return list(result.scalars().all())


async def set_product_description(session: AsyncSession, product: Product, description: str) -> None:
    product.description = description
    await session.flush()


async def set_product_photo(session: AsyncSession, product: Product, photo_file_id: str) -> None:
    product.photo_file_id = photo_file_id
    await session.flush()

async def set_product_black_photo(session: AsyncSession, product: Product, photo_file_id: str) -> None:
    product.photo_black_file_id = photo_file_id
    await session.flush()


async def archive_product(session: AsyncSession, product: Product, is_active: bool) -> None:
    product.is_active = is_active
    await session.flush()


async def replace_sizes(session: AsyncSession, product: Product, size_prices: dict[str, float]) -> None:
    await session.execute(delete(ProductSize).where(ProductSize.product_id == product.id))
    for size, price in size_prices.items():
        session.add(ProductSize(product_id=product.id, size=size, price=Decimal(str(price))))
    await session.flush()


async def set_size_price(session: AsyncSession, product: Product, size: str, price: float) -> None:
    query = select(ProductSize).where(ProductSize.product_id == product.id, ProductSize.size == size.upper())
    result = await session.execute(query)
    line = result.scalar_one_or_none()
    if line is None:
        line = ProductSize(product_id=product.id, size=size.upper(), price=Decimal(str(price)))
        session.add(line)
    else:
        line.price = Decimal(str(price))
    await session.flush()


async def get_sizes(session: AsyncSession, product_id: int) -> list[ProductSize]:
    result = await session.execute(select(ProductSize).where(ProductSize.product_id == product_id).order_by(ProductSize.size.asc()))
    return list(result.scalars().all())
