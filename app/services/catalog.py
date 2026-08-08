from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Product, ProductVariant
from app.services.groups import visibility_filter


async def create_product(session: AsyncSession, title: str, description: str, requires_color: bool = False) -> Product:
    product = Product(title=title, description=description, requires_color=requires_color)
    session.add(product)
    await session.flush()
    return product


async def get_product(session: AsyncSession, product_id: int) -> Product | None:
    result = await session.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()


async def list_active_products(session: AsyncSession) -> list[Product]:
    result = await session.execute(
        select(Product)
        .where(Product.is_active.is_(True))
        .options(selectinload(Product.variants))
        .order_by(Product.id.desc())
    )
    return list(result.scalars().all())


async def list_visible_products(session: AsyncSession, group_ids: set[int]) -> list[Product]:
    """Active products visible to a user with the given group memberships."""
    result = await session.execute(
        select(Product)
        .where(Product.is_active.is_(True))
        .where(visibility_filter(group_ids))
        .options(selectinload(Product.variants))
        .order_by(Product.id.desc())
    )
    return list(result.scalars().all())


async def list_all_products(session: AsyncSession) -> list[Product]:
    result = await session.execute(
        select(Product).options(selectinload(Product.variants)).order_by(Product.id.desc())
    )
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


async def replace_variants(session: AsyncSession, product: Product, variants: list[dict]) -> None:
    await session.execute(delete(ProductVariant).where(ProductVariant.product_id == product.id))
    for v in variants:
        session.add(
            ProductVariant(
                product_id=product.id,
                size=v["size"],
                color=v.get("color"),
                price=Decimal(str(v["price"])),
                stock_quantity=v.get("quantity")
            )
        )
    await session.flush()

async def get_variants(session: AsyncSession, product_id: int) -> list[ProductVariant]:
    result = await session.execute(select(ProductVariant).where(ProductVariant.product_id == product_id).order_by(ProductVariant.id.asc()))
    return list(result.scalars().all())
