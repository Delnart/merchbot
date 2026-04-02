from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
    
    # Ensure recipient_name column exists on orders (migration)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE orders ADD COLUMN recipient_name VARCHAR(255)"))
    except Exception:
        pass
        
    # Ensure card_number column exists on shop_configs (migration)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE shop_configs ADD COLUMN card_number VARCHAR(20)"))
    except Exception:
        pass

    # Ensure color columns exist
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE products ADD COLUMN requires_color BOOLEAN DEFAULT FALSE"))
    except Exception:
        pass

    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE cart_items ADD COLUMN color VARCHAR(20)"))
    except Exception:
        pass

    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE order_items ADD COLUMN color VARCHAR(20)"))
    except Exception:
        pass

    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS uq_cart_line"))
            await conn.execute(text("ALTER TABLE cart_items ADD CONSTRAINT uq_cart_line UNIQUE (telegram_id, product_id, size, color)"))
    except Exception:
        pass

