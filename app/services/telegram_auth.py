"""Telegram WebApp initData validation (HMAC-SHA256)."""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, unquote

from app.config import settings


def validate_init_data(init_data: str, *, max_age_seconds: int = 3600) -> dict | None:
    """Validate Telegram WebApp initData string.

    Returns parsed user dict on success, None if invalid.
    See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not init_data:
        return None

    parsed = parse_qs(init_data, keep_blank_values=True)
    received_hash = parsed.pop("hash", [None])[0]
    if not received_hash:
        return None

    # Check auth_date freshness
    auth_date_str = parsed.get("auth_date", [None])[0]
    if auth_date_str:
        try:
            auth_date = int(auth_date_str)
            if time.time() - auth_date > max_age_seconds:
                return None
        except ValueError:
            return None

    # Build data-check-string: sorted key=value pairs joined by \n
    data_check_pairs = []
    for key in sorted(parsed.keys()):
        vals = parsed[key]
        data_check_pairs.append(f"{key}={vals[0]}")
    data_check_string = "\n".join(data_check_pairs)

    # Compute HMAC-SHA256
    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    # Parse user JSON
    user_raw = parsed.get("user", [None])[0]
    if not user_raw:
        return None

    try:
        user = json.loads(unquote(user_raw))
    except (json.JSONDecodeError, TypeError):
        return None

    return user


def extract_telegram_id(init_data: str) -> int | None:
    """Extract telegram user ID from initData, returns None if invalid."""
    user = validate_init_data(init_data)
    if user is None:
        return None
    return user.get("id")
