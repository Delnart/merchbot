import asyncio
import io
import imghdr
import time
from collections import OrderedDict, defaultdict, deque
from decimal import Decimal

import aiohttp
import re
from fastapi import APIRouter, Depends, File, Form, HTTPException, Header, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db.models import (
    CartItem, DeliveryMethod, Order, OrderItem, OrderStatus,
    Product, ProductVariant, Recipient, UserProfile, PickupSlot
)
from app.db.session import AsyncSessionLocal
from app.services.admin_config import get_active_admin_binding, get_or_create_shop_config
from app.services.background import fire_and_forget, run_blocking_in_background
from app.services.cart import add_to_cart, clear_cart, ensure_user, list_cart, get_all_reserved_quantities
from datetime import datetime, timedelta
from app.services.catalog import (
    archive_product, create_product, get_product, get_variants,
    list_all_products, list_visible_products, replace_variants, set_product_description, set_product_photo,
)
from app.services.google_sheets import sync_order_to_sheet
from app.services.groups import (
    add_members, can_user_see_product, create_group, delete_group, get_group,
    get_product_group_ids, get_user_group_ids, list_groups, remove_member, set_product_groups,
)
from app.services.orders import create_order_from_cart, set_order_admin_message
from app.services.telegram_auth import validate_init_data

router = APIRouter(prefix="/api")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_TYPES = {"jpeg", "png", "gif", "webp"}
CHECKOUT_RATE_LIMIT = 5
CHECKOUT_RATE_WINDOW_SECONDS = 60
_checkout_hits: dict[str, deque[float]] = defaultdict(deque)
_checkout_rate_lock = asyncio.Lock()

# ── Shared HTTP session and photo cache ──────────────────────────────────────

_http_session: aiohttp.ClientSession | None = None

PHOTO_CACHE_MAX_BYTES = 32 * 1024 * 1024  # keep well under Render's 512 MB RAM
_photo_cache: OrderedDict[str, tuple[bytes, str]] = OrderedDict()
_photo_cache_bytes = 0
_photo_cache_lock = asyncio.Lock()

# Telegram get_chat_member is slow (~300ms) — cache admin checks
ADMIN_CACHE_OK_TTL = 300.0
ADMIN_CACHE_FAIL_TTL = 30.0
_admin_cache: dict[int, tuple[bool, float]] = {}


async def get_http_session() -> aiohttp.ClientSession:
    global _http_session
    if _http_session is None or _http_session.closed:
        _http_session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30))
    return _http_session


async def _photo_cache_get(file_id: str) -> tuple[bytes, str] | None:
    async with _photo_cache_lock:
        cached = _photo_cache.get(file_id)
        if cached is not None:
            _photo_cache.move_to_end(file_id)
        return cached


async def _photo_cache_put(file_id: str, content: bytes, content_type: str) -> None:
    global _photo_cache_bytes
    if len(content) > PHOTO_CACHE_MAX_BYTES:
        return
    async with _photo_cache_lock:
        existing = _photo_cache.pop(file_id, None)
        if existing is not None:
            _photo_cache_bytes -= len(existing[0])
        while _photo_cache and _photo_cache_bytes + len(content) > PHOTO_CACHE_MAX_BYTES:
            _, (evicted, _ct) = _photo_cache.popitem(last=False)
            _photo_cache_bytes -= len(evicted)
        _photo_cache[file_id] = (content, content_type)
        _photo_cache_bytes += len(content)


def _checkout_rate_key(request: Request, telegram_id: int) -> str:
    client_host = request.client.host if request.client else "unknown"
    return f"{telegram_id}:{client_host}"


async def _enforce_checkout_rate_limit(request: Request, telegram_id: int) -> None:
    now = time.monotonic()
    key = _checkout_rate_key(request, telegram_id)
    async with _checkout_rate_lock:
        bucket = _checkout_hits[key]
        while bucket and now - bucket[0] > CHECKOUT_RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= CHECKOUT_RATE_LIMIT:
            raise HTTPException(status_code=429, detail="too_many_requests")
        bucket.append(now)


# ── Auth dependency ──────────────────────────────────────────────────────────

async def get_telegram_user(x_telegram_init_data: str = Header(alias="X-Telegram-Init-Data", default="")) -> dict:
    """Validate Telegram initData and return user dict."""
    user = validate_init_data(x_telegram_init_data)
    if user is None:
        raise HTTPException(status_code=401, detail="open_via_telegram_required")
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

    now = time.monotonic()
    cached = _admin_cache.get(telegram_id)
    if cached is not None and cached[1] > now:
        if cached[0]:
            return telegram_id
        raise HTTPException(status_code=403, detail="not_admin")

    async with AsyncSessionLocal() as session:
        binding = await get_active_admin_binding(session)
    if binding is None:
        raise HTTPException(status_code=403, detail="no_admin_chat")
    is_admin = await is_chat_admin(bot, binding.chat_id, telegram_id)
    if is_admin is None:
        # Telegram API failed — deny this request but don't poison the cache
        raise HTTPException(status_code=403, detail="not_admin")
    if len(_admin_cache) > 5000:
        for key in [k for k, v in _admin_cache.items() if v[1] <= now]:
            _admin_cache.pop(key, None)
    _admin_cache[telegram_id] = (
        is_admin,
        now + (ADMIN_CACHE_OK_TTL if is_admin else ADMIN_CACHE_FAIL_TTL),
    )
    if not is_admin:
        raise HTTPException(status_code=403, detail="not_admin")
    return telegram_id


# ── Pydantic schemas ────────────────────────────────────────────────────────

class CartAddRequest(BaseModel):
    product_id: int
    size: str
    color: str | None = None
    quantity: int = Field(default=1, ge=1, le=99)


class CartUpdateRequest(BaseModel):
    quantity: int = Field(ge=0, le=99)


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
    requires_color: bool = False
    variants: list[dict]  # [{"size": "S", "color": "Black", "price": 500, "quantity": 10}]
    group_ids: list[int] = []  # empty = visible to everyone


class ProductUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    requires_color: bool | None = None
    variants: list[dict] | None = None
    group_ids: list[int] | None = None  # None = unchanged, [] = visible to everyone


class GroupCreate(BaseModel):
    name: str


class GroupMembersAdd(BaseModel):
    values: str  # telegram ids and/or @usernames separated by commas/newlines

class PickupSlotCreate(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM

class OrderPickupSelect(BaseModel):
    pickup_slot_id: int | None = None
    needs_individual_pickup: bool = False


# ── Catalog endpoints ────────────────────────────────────────────────────────

@router.get("/catalog")
async def api_catalog(user: dict = Depends(get_telegram_user)):
    telegram_id = user.get("id")
    if telegram_id is None:
        raise HTTPException(status_code=401, detail="missing_user_id")
    username = user.get("username")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await ensure_user(session, telegram_id, username, user.get("first_name"), user.get("last_name"))
        group_ids = await get_user_group_ids(session, telegram_id, username)
        products = await list_visible_products(session, group_ids)
        reserved_qtys = await get_all_reserved_quantities(session)
        result = []
        for p in products:
            min_price = min((v.price for v in p.variants), default=0)
            result.append({
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "photo_url": f"/api/photos/{p.photo_file_id}" if p.photo_file_id else None,
                "photo_black_url": f"/api/photos/{p.photo_black_file_id}" if getattr(p, 'photo_black_file_id', None) else None,
                "requires_color": p.requires_color,
                "min_price": float(min_price),
                "variants": [{"size": v.size, "color": v.color, "price": float(v.price), "quantity": v.stock_quantity, "reserved": reserved_qtys.get((p.id, v.size, v.color), 0)} for v in p.variants],
            })
    return {"products": result}


@router.get("/catalog/{product_id}")
async def api_catalog_item(product_id: int, user: dict = Depends(get_telegram_user)):
    telegram_id = user.get("id")
    if telegram_id is None:
        raise HTTPException(status_code=401, detail="missing_user_id")
    async with AsyncSessionLocal() as session:
        product = await get_product(session, product_id)
        if not product or not product.is_active:
            raise HTTPException(status_code=404, detail="product_not_found")
        if not await can_user_see_product(session, product_id, telegram_id, user.get("username")):
            raise HTTPException(status_code=404, detail="product_not_found")
        variants = await get_variants(session, product_id)
        reserved_qtys = await get_all_reserved_quantities(session)
    return {
        "id": product.id,
        "title": product.title,
        "description": product.description,
        "requires_color": product.requires_color,
        "photo_url": f"/api/photos/{product.photo_file_id}" if product.photo_file_id else None,
        "photo_black_url": f"/api/photos/{product.photo_black_file_id}" if getattr(product, 'photo_black_file_id', None) else None,
        "variants": [{"size": v.size, "color": v.color, "price": float(v.price), "quantity": v.stock_quantity, "reserved": reserved_qtys.get((product.id, v.size, v.color), 0)} for v in variants],
    }


@router.get("/photos/{file_id:path}")
async def api_photo_proxy(file_id: str, if_none_match: str | None = Header(default=None, alias="If-None-Match")):
    """Proxy Telegram file to the browser with in-memory and browser caching."""
    # A Telegram file_id always points to the same content — cache aggressively
    etag = f'"{file_id}"'
    cache_headers = {"Cache-Control": "public, max-age=31536000, immutable", "ETag": etag}
    if if_none_match == etag:
        return Response(status_code=304, headers=cache_headers)

    cached = await _photo_cache_get(file_id)
    if cached is not None:
        return Response(content=cached[0], media_type=cached[1], headers=cache_headers)

    try:
        http = await get_http_session()
        tg_file_url = f"https://api.telegram.org/bot{settings.bot_token}/getFile?file_id={file_id}"
        async with http.get(tg_file_url) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=502, detail="photo_fetch_failed")
            data = await resp.json()
            if not data.get("ok"):
                raise HTTPException(status_code=404, detail="file_not_found")
            file_path = data["result"]["file_path"]

        download_url = f"https://api.telegram.org/file/bot{settings.bot_token}/{file_path}"
        async with http.get(download_url) as resp:
            # Never cache or serve Telegram error bodies as images: with the
            # immutable cache headers a poisoned entry would stick for a year
            if resp.status != 200:
                raise HTTPException(status_code=502, detail="photo_fetch_failed")
            content = await resp.read()
            content_type = resp.headers.get("Content-Type", "image/jpeg")
        if not content_type.startswith("image/"):
            content_type = "image/jpeg"

        await _photo_cache_put(file_id, content, content_type)
        return Response(content=content, media_type=content_type, headers=cache_headers)
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
        reserved_qtys = await get_all_reserved_quantities(session)
    items = []
    total = Decimal("0")
    for item, product in rows:
        line_total = Decimal(str(item.price)) * item.quantity
        total += line_total
        # Get available quantity for this variant
        v = next((v for v in product.variants if v.size == item.size and v.color == item.color), None)
        available_qty = None
        if v and v.stock_quantity is not None:
            reserved = reserved_qtys.get((product.id, v.size, v.color), 0)
            available_qty = max(0, v.stock_quantity - reserved)

        items.append({
            "id": item.id,
            "product_id": item.product_id,
            "title": product.title,
            "size": item.size,
            "color": item.color,
            "price": float(item.price),
            "quantity": item.quantity,
            "line_total": float(line_total),
            "photo_url": f"/api/photos/{product.photo_file_id}" if product.photo_file_id else None,
            "available_quantity": available_qty,
        })
    return {"items": items, "total": float(total)}


@router.post("/cart")
async def api_cart_add(body: CartAddRequest, user: dict = Depends(get_telegram_user)):
    telegram_id = user.get("id")
    if telegram_id is None:
        raise HTTPException(status_code=401, detail="missing_user_id")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await ensure_user(session, telegram_id, user.get("username"), user.get("first_name"), user.get("last_name"))
            if not await can_user_see_product(session, body.product_id, telegram_id, user.get("username")):
                raise HTTPException(status_code=404, detail="product_not_found")
            try:
                await add_to_cart(session, telegram_id, body.product_id, body.size, body.color, body.quantity)
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


# ── Pickup Slots (User) ─────────────────────────────────────────────────────

@router.get("/pickup-slots")
async def api_get_available_pickup_slots(telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        # Get active slots
        result = await session.execute(
            select(PickupSlot).where(PickupSlot.is_active.is_(True)).order_by(PickupSlot.date.asc(), PickupSlot.start_time.asc())
        )
        slots = result.scalars().all()
        
        # Check for booked slots today to override "no today slots" rule
        today = datetime.utcnow().date()
        
        booked_result = await session.execute(
            select(Order.pickup_slot_id)
            .where(Order.pickup_slot_id.is_not(None), Order.status != OrderStatus.cancelled)
        )
        booked_slot_ids = set(booked_result.scalars().all())
        
        available = []
        for s in slots:
            slot_date = s.date.date()
            if slot_date < today:
                continue
            
            if slot_date == today:
                # Can only pick today if someone else booked it and time hasn't passed
                if s.id not in booked_slot_ids:
                    continue
                # Time check
                now_time = datetime.utcnow().strftime("%H:%M") # Actually UTC time vs Local time. The user specified "04.08 12:00-14:00" in local time probably. But we'll just compare strings since server might be in UTC. Or wait, let's just do a naive string comparison for now.
                if s.start_time < now_time:
                    continue
                    
            available.append({
                "id": s.id,
                "date": slot_date.isoformat(),
                "start_time": s.start_time,
                "end_time": s.end_time,
            })
            
    return {"slots": available}

@router.post("/orders/{order_id}/pickup")
async def api_select_pickup_slot(order_id: int, body: OrderPickupSelect, telegram_id: int = Depends(get_telegram_id)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(select(Order).where(Order.id == order_id, Order.telegram_id == telegram_id))
            order = result.scalar_one_or_none()
            if not order:
                raise HTTPException(status_code=404, detail="order_not_found")
                
            if order.delivery_method not in [DeliveryMethod.campus, DeliveryMethod.dayf, DeliveryMethod.later_campus]:
                raise HTTPException(status_code=400, detail="invalid_delivery_method_for_pickup")
                
            if body.pickup_slot_id:
                slot_res = await session.execute(select(PickupSlot).where(PickupSlot.id == body.pickup_slot_id))
                slot = slot_res.scalar_one_or_none()
                if not slot:
                    raise HTTPException(status_code=404, detail="slot_not_found")
                slot_info = f"{slot.date.strftime('%Y-%m-%d')} {slot.start_time}-{slot.end_time}"
            else:
                slot_info = "Не обрано"
                    
            order.pickup_slot_id = body.pickup_slot_id
            order.needs_individual_pickup = body.needs_individual_pickup
            
            # Notify admin chat
            if order.admin_message_id:
                binding = await get_active_admin_binding(session)
                if binding:
                    from app.main import bot
                    try:
                        indiv = 'Так' if body.needs_individual_pickup else 'Ні'
                        await bot.send_message(
                            binding.chat_id,
                            f"🗓 Користувач обрав час видачі для замовлення #{order.id}:\n"
                            f"Слот: {slot_info}\n"
                            f"Індивідуальна видача: {indiv}",
                            reply_to_message_id=order.admin_message_id
                        )
                    except Exception:
                        pass
            
    return {"ok": True}


# ── Checkout endpoint ────────────────────────────────────────────────────────

def _delivery_label(method: str) -> str:
    return {"nova_poshta": "Нова Пошта", "campus": "На DayF", "dayf": "DayF", "later_campus": "Пізніше в корпусі"}.get(method, method)

@router.post("/checkout/start")
async def api_checkout_start(user: dict = Depends(get_telegram_user)):
    telegram_id = user.get("id")
    if not telegram_id:
        raise HTTPException(status_code=401, detail="missing_user_id")
    
    async with AsyncSessionLocal() as session:
        async with session.begin():
            user_profile = await ensure_user(session, telegram_id, user.get("username"), user.get("first_name"), user.get("last_name"))
            cart_items = await list_cart(session, telegram_id)
            
            if user_profile.checkout_expires_at and user_profile.checkout_expires_at > datetime.utcnow():
                user_profile.checkout_expires_at = datetime.utcnow() + timedelta(minutes=15)
                return {"ok": True}
                
            reserved_qtys = await get_all_reserved_quantities(session)
            for cart_item, product in cart_items:
                variant = next((v for v in product.variants if v.size == cart_item.size and v.color == cart_item.color), None)
                if not variant:
                    raise HTTPException(status_code=400, detail="variant_not_found")
                    
                if variant.stock_quantity is not None:
                    reserved = reserved_qtys.get((product.id, variant.size, variant.color), 0)
                    available = variant.stock_quantity - reserved
                    if cart_item.quantity > available:
                        raise HTTPException(status_code=400, detail=f"not_enough_quantity_for_{product.title}")
            
            user_profile.checkout_expires_at = datetime.utcnow() + timedelta(minutes=15)
            
    return {"ok": True}


@router.post("/checkout")
async def api_checkout(
    request: Request,
    delivery_method: str = Form(...),
    delivery_address: str = Form(""),
    recipient_id: int | None = Form(None),
    recipient_name: str | None = Form(None),
    recipient_phone: str | None = Form(None),
    save_recipient: bool = Form(False),
    receipt_photo: UploadFile = File(...),
    user: dict = Depends(get_telegram_user),
):
    """Process checkout with receipt photo upload."""
    telegram_id = user.get("id")
    if telegram_id is None:
        raise HTTPException(status_code=401, detail="missing_user_id")
    await _enforce_checkout_rate_limit(request, telegram_id)

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
    if len(photo_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file_too_large")
    receipt_file_id = await _upload_photo_to_telegram(telegram_id, photo_bytes)

    # Build address
    if delivery_method == "campus":
        address = "На DayF"
    elif delivery_method == "dayf":
        address = "На DayF"
    elif delivery_method == "later_campus":
        address = "Пізніше в корпусі"
    else:
        address = delivery_address.strip()

    # Create order
    async with AsyncSessionLocal() as session:
        async with session.begin():
            config = await get_or_create_shop_config(session)
            # Re-verify group visibility: membership or product restrictions
            # may have changed since the item was added to the cart
            checked_products: set[int] = set()
            for cart_item, _product in await list_cart(session, telegram_id):
                if cart_item.product_id in checked_products:
                    continue
                checked_products.add(cart_item.product_id)
                if not await can_user_see_product(session, cart_item.product_id, telegram_id, user.get("username")):
                    raise HTTPException(status_code=409, detail="product_not_available")
            order = await create_order_from_cart(
                session,
                telegram_id=telegram_id,
                phone=final_phone,
                address=address,
                receipt_photo_id=receipt_file_id,
                currency=config.currency,
                delivery_method=delivery_method,
            )
            
            # Clear checkout session and deduct stock
            user_profile = await ensure_user(session, telegram_id, None, None, None)
            user_profile.checkout_expires_at = None
            for item in order.items:
                if item.product_id:
                    v_query = select(ProductVariant).where(
                        ProductVariant.product_id == item.product_id,
                        ProductVariant.size == item.size
                    )
                    if item.color:
                        v_query = v_query.where(ProductVariant.color == item.color)
                    else:
                        v_query = v_query.where(ProductVariant.color.is_(None))
                    v_res = await session.execute(v_query)
                    variant = v_res.scalar_one_or_none()
                    if variant and variant.stock_quantity is not None:
                        variant.stock_quantity -= item.quantity
            
            order.recipient_name = final_name
            binding = await get_active_admin_binding(session)
            await session.refresh(order)
            await session.refresh(order, attribute_names=["items"])

    # Sync to Google Sheets in a worker thread: gspread performs blocking HTTP
    # calls that would freeze the event loop and delay the response by seconds
    items_str = "; ".join([f"{i.title} {i.size}{' ' + i.color if i.color else ''} x{i.quantity}" for i in order.items])
    run_blocking_in_background(
        sync_order_to_sheet,
        order_id=order.id,
        status=order.status.value,
        total=float(order.total_amount),
        name=final_name,
        phone=final_phone,
        delivery=f"{_delivery_label(delivery_method)} {address}",
        items_str=items_str,
    )

    # Notify admin chat without making the customer wait
    if binding is not None:
        fire_and_forget(
            _notify_admin_chat(binding, order, final_name, final_phone, delivery_method, address, receipt_file_id)
        )

    return {"ok": True, "order_id": order.id}


def resize_image_for_telegram(photo_bytes: bytes) -> bytes:
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(photo_bytes))
        img.thumbnail((1920, 1920))
        if img.mode in ("RGBA", "LA", "P"):
            if img.mode == "P":
                img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            # Use alpha channel as mask if it exists
            mask = img.split()[3] if len(img.split()) >= 4 else None
            bg.paste(img, mask=mask)
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85)
        return out.getvalue()
    except Exception:
        return photo_bytes

async def _upload_photo_to_telegram(chat_id: int, photo_bytes: bytes) -> str:
    """Send photo to the admin chat to get a file_id, then delete the message."""
    from app.main import bot
    from aiogram.types import BufferedInputFile

    if len(photo_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file_too_large")

    img_type = imghdr.what(None, h=photo_bytes[:32])
    if img_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="invalid_file_type")

    photo_bytes = await asyncio.to_thread(resize_image_for_telegram, photo_bytes)
    input_file = BufferedInputFile(photo_bytes, filename="receipt.jpg")
    try:
        msg = await bot.send_photo(chat_id=chat_id, photo=input_file, disable_notification=True)
        file_id = msg.photo[-1].file_id
        try:
            await bot.delete_message(chat_id=chat_id, message_id=msg.message_id)
        except Exception:
            pass
    except Exception as e:
        # Fallback to group chat if PM is forbidden
        async with AsyncSessionLocal() as session:
            binding = await get_active_admin_binding(session)
        if binding:
            try:
                msg = await bot.send_photo(chat_id=binding.chat_id, photo=input_file, disable_notification=True)
                file_id = msg.photo[-1].file_id
                try:
                    await bot.delete_message(chat_id=binding.chat_id, message_id=msg.message_id)
                except Exception:
                    pass
            except Exception as inner_e:
                raise HTTPException(status_code=400, detail=f"upload_failed_in_group: {inner_e}")
        else:
            raise HTTPException(status_code=400, detail=f"upload_failed: {e}")
            
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
        f"🔔 Замовлення #{order.id} [{status_labels.get(order.status, '')}]",
        f"👤 Клієнт: tg://user?id={order.telegram_id} ({order.telegram_id})",
        f"📋 Отримувач: {name}",
        f"📞 Телефон: {phone}",
        f"🚚 Спосіб: {_delivery_label(delivery_method)} | Адреса: {address}",
        f"💰 Сума: {Decimal(order.total_amount)} {order.currency}",
        "\n📦 Позиції:",
    ]
    for item in order.items:
        color_str = f" | {item.color}" if item.color else ""
        lines.append(f"▫️ {item.title} | {item.size}{color_str} | {item.quantity} шт x {Decimal(item.unit_price)} грн")

    caption = "\n".join(lines)

    from app.bot.keyboards import order_status_keyboard

    try:
        sent = await bot.send_photo(
            binding.chat_id,
            photo=receipt_file_id,
            caption=caption,
            reply_markup=order_status_keyboard(order.id, OrderStatus.pending),
        )
        async with AsyncSessionLocal() as session:
            async with session.begin():
                from app.services.orders import get_order
                db_order = await get_order(session, order.id)
                if db_order:
                    await set_order_admin_message(session, db_order, sent.message_id)
    except Exception as e:
        from aiogram.exceptions import TelegramMigrateToChat
        if isinstance(e, TelegramMigrateToChat) and e.migrate_to_chat_id:
            # Auto-migrate the database to the new supergroup ID
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    current = await get_active_admin_binding(session)
                    if current:
                        current.chat_id = e.migrate_to_chat_id
            
            # Retry sending with the new chat_id
            try:
                sent = await bot.send_photo(
                    e.migrate_to_chat_id,
                    photo=receipt_file_id,
                    caption=caption,
                    reply_markup=order_status_keyboard(order.id, OrderStatus.pending),
                )
                async with AsyncSessionLocal() as session:
                    async with session.begin():
                        from app.services.orders import get_order
                        db_order = await get_order(session, order.id)
                        if db_order:
                            await set_order_admin_message(session, db_order, sent.message_id)
                return
            except Exception:
                pass
        
        try:
            sent = await bot.send_message(
                binding.chat_id,
                text=caption + f"\n\n⚠️ Помилка: {e}",
                reply_markup=order_status_keyboard(order.id, OrderStatus.pending),
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
        product_groups = await get_product_group_ids(session, [p.id for p in products])
        reserved_qtys = await get_all_reserved_quantities(session)
        result = []
        for p in products:
            result.append({
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "requires_color": p.requires_color,
                "photo_url": f"/api/photos/{p.photo_file_id}" if p.photo_file_id else None,
                "photo_black_url": f"/api/photos/{p.photo_black_file_id}" if getattr(p, 'photo_black_file_id', None) else None,
                "is_active": p.is_active,
                "variants": [{"size": v.size, "color": v.color, "price": float(v.price), "quantity": v.stock_quantity, "reserved": reserved_qtys.get((p.id, v.size, v.color), 0)} for v in p.variants],
                "group_ids": product_groups.get(p.id, []),
            })
    return {"products": result}


# ── Admin: Pickup Slots ──────────────────────────────────────────────────────

@router.get("/admin/pickup-slots")
async def api_admin_pickup_slots(admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PickupSlot).order_by(PickupSlot.date.desc(), PickupSlot.start_time.desc())
        )
        slots = result.scalars().all()
    return {
        "slots": [
            {
                "id": s.id,
                "date": s.date.date().isoformat(),
                "start_time": s.start_time,
                "end_time": s.end_time,
                "is_active": s.is_active,
            } for s in slots
        ]
    }

@router.post("/admin/pickup-slots")
async def api_admin_create_pickup_slot(body: PickupSlotCreate, admin_id: int = Depends(require_admin)):
    try:
        dt = datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_date")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            slot = PickupSlot(
                date=dt,
                start_time=body.start_time,
                end_time=body.end_time,
            )
            session.add(slot)
            await session.flush()
            sid = slot.id
    return {"id": sid, "ok": True}

@router.delete("/admin/pickup-slots/{slot_id}")
async def api_admin_delete_pickup_slot(slot_id: int, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(select(PickupSlot).where(PickupSlot.id == slot_id))
            slot = result.scalar_one_or_none()
            if not slot:
                raise HTTPException(status_code=404, detail="slot_not_found")
            await session.delete(slot)
    return {"ok": True}

@router.post("/admin/products")
async def api_admin_product_create(body: ProductCreate, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await create_product(session, title=body.title, description=body.description, requires_color=body.requires_color)
            await replace_variants(session, product, body.variants)
            if body.group_ids:
                await set_product_groups(session, product.id, body.group_ids)
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
            if body.requires_color is not None:
                product.requires_color = body.requires_color
            if body.variants is not None:
                await replace_variants(session, product, body.variants)
            if body.group_ids is not None:
                await set_product_groups(session, product_id, body.group_ids)
    return {"ok": True}


# ── Admin: user groups ───────────────────────────────────────────────────────

@router.get("/admin/groups")
async def api_admin_groups(admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        groups = await list_groups(session)
    return {
        "groups": [
            {
                "id": g.id,
                "name": g.name,
                "members": [
                    {"id": m.id, "telegram_id": m.telegram_id, "username": m.username}
                    for m in g.members
                ],
            }
            for g in groups
        ]
    }


@router.post("/admin/groups")
async def api_admin_group_create(body: GroupCreate, admin_id: int = Depends(require_admin)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="invalid_group_name")
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                group = await create_group(session, name)
                gid = group.id
    except IntegrityError:
        raise HTTPException(status_code=400, detail="group_already_exists")
    return {"id": gid, "ok": True}


@router.delete("/admin/groups/{group_id}")
async def api_admin_group_delete(group_id: int, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            deleted, archived = await delete_group(session, group_id)
            if not deleted:
                raise HTTPException(status_code=404, detail="group_not_found")
    return {"ok": True, "archived_products": archived}


@router.post("/admin/groups/{group_id}/members")
async def api_admin_group_add_members(group_id: int, body: GroupMembersAdd, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            group = await get_group(session, group_id)
            if group is None:
                raise HTTPException(status_code=404, detail="group_not_found")
            added = await add_members(session, group, body.values)
    return {"ok": True, "added": added}


@router.delete("/admin/groups/{group_id}/members/{member_id}")
async def api_admin_group_remove_member(group_id: int, member_id: int, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            removed = await remove_member(session, group_id, member_id)
            if not removed:
                raise HTTPException(status_code=404, detail="member_not_found")
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
    photo_bytes = await asyncio.to_thread(resize_image_for_telegram, photo_bytes)
    input_file = BufferedInputFile(photo_bytes, filename="product.jpg")
    
    try:
        msg = await bot.send_photo(chat_id=admin_id, photo=input_file, disable_notification=True)
        file_id = msg.photo[-1].file_id
        try:
            await bot.delete_message(chat_id=admin_id, message_id=msg.message_id)
        except Exception:
            pass
    except Exception as e:
        # Fallback to group chat if PM is forbidden
        async with AsyncSessionLocal() as session:
            binding = await get_active_admin_binding(session)
        if binding:
            try:
                msg = await bot.send_photo(chat_id=binding.chat_id, photo=input_file, disable_notification=True)
                file_id = msg.photo[-1].file_id
                try:
                    await bot.delete_message(chat_id=binding.chat_id, message_id=msg.message_id)
                except Exception:
                    pass
            except Exception as inner_e:
                raise HTTPException(status_code=400, detail=f"upload_failed_in_group: {inner_e}")
        else:
            raise HTTPException(status_code=400, detail=f"upload_failed: {e}")

    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await get_product(session, product_id)
            if not product:
                raise HTTPException(status_code=404, detail="product_not_found")
            await set_product_photo(session, product, file_id)
    return {"ok": True, "photo_url": f"/api/photos/{file_id}"}


@router.post("/admin/products/{product_id}/photo_black")
async def api_admin_product_photo_black(
    product_id: int,
    photo: UploadFile = File(...),
    admin_id: int = Depends(require_admin),
):
    """Upload product black photo via Telegram Bot API to get a file_id."""
    photo_bytes = await photo.read()

    from app.main import bot
    from aiogram.types import BufferedInputFile

    photo_bytes = await asyncio.to_thread(resize_image_for_telegram, photo_bytes)
    input_file = BufferedInputFile(photo_bytes, filename="product_black.jpg")
    
    try:
        msg = await bot.send_photo(chat_id=admin_id, photo=input_file, disable_notification=True)
        file_id = msg.photo[-1].file_id
        try:
            await bot.delete_message(chat_id=admin_id, message_id=msg.message_id)
        except Exception:
            pass
    except Exception as e:
        async with AsyncSessionLocal() as session:
            binding = await get_active_admin_binding(session)
        if binding:
            try:
                msg = await bot.send_photo(chat_id=binding.chat_id, photo=input_file, disable_notification=True)
                file_id = msg.photo[-1].file_id
                try:
                    await bot.delete_message(chat_id=binding.chat_id, message_id=msg.message_id)
                except Exception:
                    pass
            except Exception as inner_e:
                raise HTTPException(status_code=400, detail=f"upload_failed_in_group: {inner_e}")
        else:
            raise HTTPException(status_code=400, detail=f"upload_failed: {e}")

    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await get_product(session, product_id)
            if not product:
                raise HTTPException(status_code=404, detail="product_not_found")
            from app.services.catalog import set_product_black_photo
            await set_product_black_photo(session, product, file_id)
    return {"ok": True, "photo_black_url": f"/api/photos/{file_id}"}


@router.post("/admin/products/{product_id}/toggle")
async def api_admin_product_toggle(product_id: int, admin_id: int = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            product = await get_product(session, product_id)
            if not product:
                raise HTTPException(status_code=404, detail="product_not_found")
            new_active = not product.is_active
            await archive_product(session, product, new_active)
    return {"ok": True, "is_active": new_active}


@router.get("/admin/check")
async def api_admin_check(admin_id: int = Depends(require_admin)):
    """Simple endpoint to check if user is admin."""
    return {"is_admin": True}
