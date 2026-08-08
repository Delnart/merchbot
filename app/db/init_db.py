from sqlalchemy import text

import app.db.models  # noqa: F401 — registers every table on Base.metadata
from app.db.base import Base
from app.db.session import engine

# Ad-hoc column migrations for databases created before these fields existed.
_PG_MIGRATIONS = [
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255)",
    "ALTER TABLE shop_configs ADD COLUMN IF NOT EXISTS card_number VARCHAR(20)",
    "ALTER TABLE shop_configs ADD COLUMN IF NOT EXISTS is_dayf_delivery_enabled BOOLEAN DEFAULT FALSE",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_color BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_black_file_id VARCHAR(255)",
    "ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS color VARCHAR(20)",
    "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color VARCHAR(20)",
    "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_slot_id INTEGER",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_individual_pickup BOOLEAN DEFAULT FALSE",
]

_SQLITE_MIGRATIONS = [
    "ALTER TABLE orders ADD COLUMN recipient_name VARCHAR(255)",
    "ALTER TABLE shop_configs ADD COLUMN card_number VARCHAR(20)",
    "ALTER TABLE shop_configs ADD COLUMN is_dayf_delivery_enabled BOOLEAN DEFAULT FALSE",
    "ALTER TABLE products ADD COLUMN requires_color BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE products ADD COLUMN photo_black_file_id VARCHAR(255)",
    "ALTER TABLE cart_items ADD COLUMN color VARCHAR(20)",
    "ALTER TABLE order_items ADD COLUMN color VARCHAR(20)",
    "ALTER TABLE user_profiles ADD COLUMN checkout_expires_at TIMESTAMP",
    "ALTER TABLE orders ADD COLUMN pickup_slot_id INTEGER",
    "ALTER TABLE orders ADD COLUMN needs_individual_pickup BOOLEAN DEFAULT FALSE",
]


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)

    if engine.dialect.name == "postgresql":
        # One round trip: IF NOT EXISTS makes every statement idempotent,
        # keeping cold starts fast (the old per-statement try/rollback loop
        # cost ~8 sequential transactions on every boot)
        async with engine.begin() as conn:
            for stmt in _PG_MIGRATIONS:
                await conn.execute(text(stmt))
        # Old databases may have uq_cart_line WITHOUT the color column, which
        # breaks color-variant carts. Recreate it only when color is missing,
        # so we don't churn the constraint on every boot.
        try:
            async with engine.begin() as conn:
                await conn.execute(text(
                    """
                    DO $$ BEGIN
                        IF to_regclass('cart_items') IS NOT NULL
                           AND NOT EXISTS (
                            SELECT 1 FROM pg_constraint c
                            JOIN pg_attribute a
                              ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                            WHERE c.conname = 'uq_cart_line'
                              AND c.conrelid = 'cart_items'::regclass
                              AND a.attname = 'color'
                        ) THEN
                            ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS uq_cart_line;
                            ALTER TABLE cart_items ADD CONSTRAINT uq_cart_line UNIQUE (telegram_id, product_id, size, color);
                        END IF;
                    END $$;
                    """
                ))
        except Exception:
            pass
    else:
        # SQLite (local dev) has no ADD COLUMN IF NOT EXISTS
        for stmt in _SQLITE_MIGRATIONS:
            try:
                async with engine.begin() as conn:
                    await conn.execute(text(stmt))
            except Exception:
                pass
