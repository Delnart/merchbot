"""REST API endpoints for the Telegram Mini App."""

import io
from decimal import Decimal

import aiohttp
import re
from fastapi import APIRouter, Depends, File, Form, HTTPException, Header, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db.models import (
    CartItem, DeliveryMethod, Order, OrderItem, OrderStatus,
    Product, ProductSize, Recipient, UserProfile,
)
from app.db.session import AsyncSessionLocal
from app.services.admin_config import get_active_admin_binding, get_or_create_shop_config
from app.services.cart import add_to_cart, clear_cart, ensure_user, list_cart
from app.services.catalog import (
    archive_product, create_product, get_product, get_sizes,
    list_active_products, list_all_products, replace_sizes, set_product_description, set_product_photo,
)
from app.services.google_sheets import sync_order_to_sheet
from app.services.orders import create_order_from_cart, set_order_admin_message
from app.services.telegram_auth import validate_init_data

router = APIRouter(prefix="/api")


# ── Auth dependency ──────────────────────────────────────────────────────────

async def get_telegram_user(x_telegram_init_data: str = Header(alias="X-Telegram-Init-Data", default="")) -> dict:
    """Validate Telegram initData and return user dict."""
    user = validate_init_data(x_telegram_init_data)
    if user is None:
        raise HTTPException(status_code=401, detail="invalid_init_data")
    return user


async def get_telegram_id(user: dict = Depends(get_telegram_user)) -> int:
    uid = user.get("id")
    if uid is None:
        raise HTTPException(status_code=401, detail="missing_user_id")
    return uid


async def require_admin(telegram_id: int = Depends(get_telegram_id)) -> int:
    """Check that the user is an admin (member of admin chat)."""
    from app.services.auth import is_chat_admin
    from app.main import bot

    async with AsyncSessionLocal() as session:
        binding = await get_active_admin_binding(session)
    if binding is None:
        raise HTTPException(status_code=403, detail="no_admin_chat")
    if not await is_chat_admin(bot, binding.chat_id, telegram_id):
        raise HTTPException(status_code=403, detail="not_admin")
    return telegram_id


# ── Pydantic schemas ────────────────────────────────────────────────────────

class CartAddRequest(BaseModel):
    product_id: int
    size: str
    quantity: int = 1


class CartUpdateRequest(BaseModel):
    quantity: int


class RecipientCreate(BaseModel):
    full_name: str
    phone: str
    is_default: bool = False

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cln = re.sub(r"[\s\-]", "", v)
        if not re.match(r"^(\+?380|0)\d{9}$", cln):
            raise ValueError("Invalid phone format")
        return cln

class RecipientUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is not None:
            cln = re.sub(r"[\s\-]", "", v)
            if not re.match(r"^(\+?380|0)\d{9}$", cln):
                raise ValueError("Invalid phone format")
            return cln
        return v


class ProductCreate(BaseModel):
    title: str
    description: str
    sizes: dict[str, float]  # e.g. {"S": 500, "M": 550}


class ProductUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    sizes: dict[str, float] | None = None


# ── Catalog endpoints ────────────────────────────────────────────────────────

@router.get("/catalog")
async def api_catalog(telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await ensure_user(session, telegram_id, None, None, None)
        products = await list_active_products(session)
        result = []
        for p in products:
            sizes = await get_sizes(session, p.id)
            min_price = min((s.price for s in sizes), default=0)
            result.append({
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "photo_url": f"/api/photos/{p.photo_file_id}" if p.photo_file_id else None,
                "min_price": float(min_price),
                "sizes": [{"size": s.size, "price": float(s.price)} for s in sizes],
            })
    return {"products": result}


@router.get("/catalog/{product_id}")
async def api_catalog_item(product_id: int, _: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        product = await get_product(session, product_id)
        if not product or not product.is_active:
            raise HTTPException(status_code=404, detail="product_not_found")
        sizes = await get_sizes(session, product_id)
    return {
        "id": product.id,
        "title": product.title,
        "description": product.description,
        "photo_url": f"/api/photos/{product.photo_file_id}" if product.photo_file_id else None,
        "sizes": [{"size": s.size, "price": float(s.price)} for s in sizes],
    }


@router.get("/photos/{file_id:path}")
async def api_photo_proxy(file_id: str):
    """Proxy Telegram file to the browser."""
    try:
        tg_file_url = f"https://api.telegram.org/bot{settings.bot_token}/getFile?file_id={file_id}"
        async with aiohttp.ClientSession() as http:
            async with http.get(tg_file_url) as resp:
                data = await resp.json()
                if not data.get("ok"):
                    raise HTTPException(status_code=404, detail="file_not_found")
                file_path = data["result"]["file_path"]

            download_url = f"https://api.telegram.org/file/bot{settings.bot_token}/{file_path}"
            async with http.get(download_url) as resp:
                content = await resp.read()
                content_type = resp.headers.get("Content-Type", "image/jpeg")

        from fastapi.responses import Response
        return Response(content=content, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="photo_proxy_error")


# ── Shop config ──────────────────────────────────────────────────────────────

@router.get("/config")
async def api_shop_config(_: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        config = await get_or_create_shop_config(session)
    return {
        "currency": config.currency,
        "mono_jar_url": config.mono_jar_url,
        "card_number": config.card_number,
        "is_dayf_delivery_enabled": config.is_dayf_delivery_enabled,
    }


# ── Cart endpoints ───────────────────────────────────────────────────────────

@router.get("/cart")
async def api_cart_view(telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        rows = await list_cart(session, telegram_id)
    items = []
    total = Decimal("0")
    for item, product in rows:
        line_total = Decimal(str(item.price)) * item.quantity
        total += line_total
        items.append({
            "id": item.id,
            "product_id": item.product_id,
            "title": product.title,
            "size": item.size,
            "price": float(item.price),
            "quantity": item.quantity,
            "line_total": float(line_total),
            "photo_url": f"/api/photos/{product.photo_file_id}" if product.photo_file_id else None,
        })
    return {"items": items, "total": float(total)}


@router.post("/cart")
async def api_cart_add(body: CartAddRequest, telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await ensure_user(session, telegram_id, None, None, None)
            try:
                await add_to_cart(session, telegram_id, body.product_id, body.size, body.quantity)
            except ValueError:
                raise HTTPException(status_code=400, detail="invalid_size")
    return {"ok": True}


@router.patch("/cart/{item_id}")
async def api_cart_update(item_id: int, body: CartUpdateRequest, telegram_id: int = Depends(get_telegram_id)):
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="invalid_quantity")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                select(CartItem).where(CartItem.id == item_id, CartItem.telegram_id == telegram_id)
            )
            item = result.scalar_one_or_none()
            if not item:
                raise HTTPException(status_code=404, detail="item_not_found")
            item.quantity = body.quantity
    return {"ok": True}


@router.delete("/cart/{item_id}")
async def api_cart_remove(item_id: int, telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                select(CartItem).where(CartItem.id == item_id, CartItem.telegram_id == telegram_id)
            )
            item = result.scalar_one_or_none()
            if not item:
                raise HTTPException(status_code=404, detail="item_not_found")
            await session.delete(item)
    return {"ok": True}


@router.delete("/cart")
async def api_cart_clear(telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await clear_cart(session, telegram_id)
    return {"ok": True}


# ── Recipient endpoints ─────────────────────────────────────────────────────

@router.get("/orders")
async def api_orders_list(telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Order).where(Order.telegram_id == telegram_id).order_by(Order.created_at.desc())
        )
        orders = list(result.scalars().all())
    return {
        "orders": [
            {
                "id": o.id,
                "status": o.status.value,
                "total_amount": float(o.total_amount),
                "created_at": o.created_at.isoformat(),
                "delivery_method": o.delivery_method.value if o.delivery_method else None,
                "address": o.address,
            } for o in orders
        ]
    }


@router.get("/recipients")
async def api_recipients_list(telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Recipient).where(Recipient.telegram_id == telegram_id).order_by(Recipient.id.asc())
        )
        recipients = list(result.scalars().all())
    return {
        "recipients": [
            {"id": r.id, "full_name": r.full_name, "phone": r.phone, "is_default": r.is_default}
            for r in recipients
        ]
    }


@router.post("/recipients")
async def api_recipient_create(body: RecipientCreate, telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            if body.is_default:
                await session.execute(
                    select(Recipient).where(Recipient.telegram_id == telegram_id, Recipient.is_default.is_(True))
                )
                # Unset any existing defaults
                existing = await session.execute(
                    select(Recipient).where(Recipient.telegram_id == telegram_id, Recipient.is_default.is_(True))
                )
                for r in existing.scalars().all():
                    r.is_default = False
            recipient = Recipient(
                telegram_id=telegram_id, full_name=body.full_name, phone=body.phone, is_default=body.is_default,
            )
            session.add(recipient)
            await session.flush()
            rid = recipient.id
    return {"id": rid, "ok": True}


@router.put("/recipients/{recipient_id}")
async def api_recipient_update(recipient_id: int, body: RecipientUpdate, telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                select(Recipient).where(Recipient.id == recipient_id, Recipient.telegram_id == telegram_id)
            )
            recipient = result.scalar_one_or_none()
            if not recipient:
                raise HTTPException(status_code=404, detail="recipient_not_found")
            if body.full_name is not None:
                recipient.full_name = body.full_name
            if body.phone is not None:
                recipient.phone = body.phone
    return {"ok": True}


@router.delete("/recipients/{recipient_id}")
async def api_recipient_delete(recipient_id: int, telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                select(Recipient).where(Recipient.id == recipient_id, Recipient.telegram_id == telegram_id)
            )
            recipient = result.scalar_one_or_none()
            if not recipient:
                raise HTTPException(status_code=404, detail="recipient_not_found")
            await session.delete(recipient)
    return {"ok": True}


@router.post("/recipients/{recipient_id}/set-default")
async def api_recipient_set_default(recipient_id: int, telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # Unset all defaults
            existing = await session.execute(
                select(Recipient).where(Recipient.telegram_id == telegram_id, Recipient.is_default.is_(True))
            )
            for r in existing.scalars().all():
                r.is_default = False
            # Set new default
            result = await session.execute(
                select(Recipient).where(Recipient.id == recipient_id, Recipient.telegram_id == telegram_id)
            )
            recipient = result.scalar_one_or_none()
            if not recipient:
                raise HTTPException(status_code=404, detail="recipient_not_found")
            recipient.is_default = True
    return {"ok": True}


# ── Checkout endpoint ────────────────────────────────────────────────────────

def _delivery_label(method: str) -> str:
    return {"nova_poshta": "Нова Пошта", "campus": "На DayF", "dayf": "DayF"}.get(method, method)


@router.post("/checkout")
async def api_checkout(
    delivery_method: str = Form(...),
    delivery_address: str = Form(""),
    recipient_id: int | None = Form(None),
    recipient_name: str | None = Form(None),
    recipient_phone: str | None = Form(None),
    save_recipient: bool = Form(False),
    receipt_photo: UploadFile = File(...),
    telegram_id: int = Depends(get_telegram_id),
):
    """Process checkout with receipt photo upload."""
    # Validate delivery method
    try:
        method_enum = DeliveryMethod(delivery_method)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_delivery_method")

    if delivery_method == "nova_poshta" and not delivery_address.strip():
        raise HTTPException(status_code=400, detail="address_required")

    # Resolve recipient
    final_name = ""
    final_phone = ""

    if recipient_id:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Recipient).where(Recipient.id == recipient_id, Recipient.telegram_id == telegram_id)
            )
            recipient = result.scalar_one_or_none()
            if not recipient:
                raise HTTPException(status_code=404, detail="recipient_not_found")
            final_name = recipient.full_name
            final_phone = recipient.phone
    else:
        if not recipient_name or not recipient_phone:
            raise HTTPException(status_code=400, detail="recipient_info_required")
        final_name = recipient_name.strip()
        final_phone = recipient_phone.strip()

    # Optionally save the recipient
    if save_recipient and not recipient_id:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                session.add(Recipient(
                    telegram_id=telegram_id, full_name=final_name, phone=final_phone,
                ))

    # Upload receipt photo via Telegram Bot API to get file_id
    photo_bytes = await receipt_photo.read()
    receipt_file_id = await _upload_photo_to_telegram(telegram_id, photo_bytes)

    # Build address
    if delivery_method == "campus":
        address = "На DayF"
    elif delivery_method == "dayf":
        address = "На DayF"
    else:
        address = delivery_address.strip()

    # Create order
    async with AsyncSessionLocal() as session:
        async with session.begin():
            config = await get_or_create_shop_config(session)
            order = await create_order_from_cart(
                session,
                telegram_id=telegram_id,
                phone=final_phone,
                address=address,
                receipt_photo_id=receipt_file_id,
                currency=config.currency,
                delivery_method=delivery_method,
            )
            order.recipient_name = final_name
            binding = await get_active_admin_binding(session)
            await session.refresh(order)
            await session.refresh(order, attribute_names=["items"])

    # Sync to Google Sheets
    items_str = "; ".join([f"{i.title} {i.size} x{i.quantity}" for i in order.items])
    sync_order_to_sheet(
        order_id=order.id,
        status=order.status.value,
        total=float(order.total_amount),
        phone=f"{final_name} / {final_phone}",
        delivery=f"{_delivery_label(delivery_method)} {address}",
        items_str=items_str,
    )

    # Notify admin chat
    if binding is not None:
        await _notify_admin_chat(binding, order, final_name, final_phone, delivery_method, address, receipt_file_id)

    return {"ok": True, "order_id": order.id}


async def _upload_photo_to_telegram(chat_id: int, photo_bytes: bytes) -> str:
    """Send photo to the user's own chat to get a file_id, then delete the message."""
    from app.main import bot
    from aiogram.types import BufferedInputFile

    input_file = BufferedInputFile(photo_bytes, filename="receipt.jpg")
    msg = await bot.send_photo(chat_id=chat_id, photo=input_file)
    file_id = msg.photo[-1].file_id
    try:
        await bot.delete_message(chat_id=chat_id, message_id=msg.message_id)
    except Exception:
        pass
    return file_id


async def _notify_admin_chat(binding, order, name, phone, delivery_method, address, receipt_file_id):
    """Send order notification to admin chat."""
    from app.main import bot

    status_labels = {
        OrderStatus.pending: "🕐 Очікує",
        OrderStatus.in_process: "🔄 В роботі",
        OrderStatus.completed: "✅ Виконано",
        OrderStatus.cancelled: "❌ Скасовано",
    }

    lines = [
        f"🔔 <b>Замовлення #{order.id}</b> [{status_labels.get(order.status, '')}]",
        f"👤 Клієнт: <a href='tg://user?id={order.telegram_id}'>Профіль ({order.telegram_id})</a>",
        f"📋 Отримувач: {name}",
        f"📞 Телефон: {phone}",
        f"🚚 Спосіб: {_delivery_label(delivery_method)} | Адреса: {address}",
        f"💰 Сума: {Decimal(order.total_amount)} {order.currency}",
        "\n📦 <b>Позиції:</b>",
    ]
    for item in order.items:
        lines.append(f"▫️ {item.title} | {item.size} | {item.quantity} шт x {Decimal(item.unit_price)} грн")

    caption = "\n".join(lines)

    from app.bot.keyboards import order_status_keyboard

    try:
        sent = await bot.send_photo(
            binding.chat_id,
            photo=receipt_file_id,
            caption=caption,
            reply_markup=order_status_keyboard(order.id, OrderStatus.pending),
            parse_mode="HTML",
        )
        async with AsyncSessionLocal() as session:
            async with session.begin():
                from app.services.orders import get_order
                db_order = await get_order(session, order.id)
                if db_order:
                    await set_order_admin_message(session, db_order, sent.message_id)
    except Exception:
        pass


# ── Admin endpoints ──────────────────────────────────────────────────────────

@router.get("/admin/products")
async def api_admin_products(admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        products = await list_all_products(session)
        result = []
        for p in products:
            sizes = await get_sizes(session, p.id)
            result.append({
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "photo_url": f"/api/photos/{p.photo_file_id}" if p.photo_file_id else None,
                "is_active": p.is_active,
                "sizes": [{"size": s.size, "price": float(s.price)} for s in sizes],
            })
    return {"products": result}


@router.post("/admin/products")
async def api_admin_product_create(body: ProductCreate, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await create_product(session, title=body.title, description=body.description)
            await replace_sizes(session, product, body.sizes)
            pid = product.id
    return {"id": pid, "ok": True}


@router.put("/admin/products/{product_id}")
async def api_admin_product_update(product_id: int, body: ProductUpdate, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await get_product(session, product_id)
            if not product:
                raise HTTPException(status_code=404, detail="product_not_found")
            if body.title is not None:
                product.title = body.title
            if body.description is not None:
                await set_product_description(session, product, body.description)
            if body.sizes is not None:
                await replace_sizes(session, product, body.sizes)
    return {"ok": True}


@router.post("/admin/products/{product_id}/photo")
async def api_admin_product_photo(
    product_id: int,
    photo: UploadFile = File(...),
    admin_id: int = Depends(require_admin),
):
    """Upload product photo via Telegram Bot API to get a file_id."""
    photo_bytes = await photo.read()

    from app.main import bot
    from aiogram.types import BufferedInputFile

    # Send to admin's own chat to get file_id
    input_file = BufferedInputFile(photo_bytes, filename="product.jpg")
    msg = await bot.send_photo(chat_id=admin_id, photo=input_file)
    file_id = msg.photo[-1].file_id
    try:
        await bot.delete_message(chat_id=admin_id, message_id=msg.message_id)
    except Exception:
        pass

    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await get_product(session, product_id)
            if not product:
                raise HTTPException(status_code=404, detail="product_not_found")
            await set_product_photo(session, product, file_id)
    return {"ok": True, "photo_url": f"/api/photos/{file_id}"}


@router.post("/admin/products/{product_id}/toggle")
async def api_admin_product_toggle(product_id: int, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await get_product(session, product_id)
            if not product:
                raise HTTPException(status_code=404, detail="product_not_found")
            await archive_product(session, product, not product.is_active)
            new_status = not product.is_active
    return {"ok": True, "is_active": new_status}


@router.get("/admin/check")
async def api_admin_check(admin_id: int = Depends(require_admin)):
    """Simple endpoint to check if user is admin."""
    return {"is_admin": True}
