from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from supabase import Client

from app.core.config import settings

API_KEY_PREFIX = "ifk"
META_KEY_HASH = "infynd_agent_api_key_hash"
META_KEY_LAST4 = "infynd_agent_api_key_last4"
META_KEY_CREATED_AT = "infynd_agent_api_key_created_at"


def _api_key_secret() -> str:
    return (
        settings.USER_API_KEY_SECRET
        or settings.SUPABASE_SERVICE_ROLE_KEY
        or settings.SUPABASE_KEY
        or "infynd-fallback-api-key-secret"
    )


def _hash_user_api_key(raw_api_key: str) -> str:
    return hmac.new(
        _api_key_secret().encode("utf-8"),
        raw_api_key.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _parse_user_api_key(raw_api_key: str) -> Optional[str]:
    value = (raw_api_key or "").strip()
    if not value.startswith(f"{API_KEY_PREFIX}_"):
        return None

    remainder = value[len(API_KEY_PREFIX) + 1 :]
    if "_" not in remainder:
        return None

    user_id, _ = remainder.split("_", 1)
    try:
        uuid.UUID(user_id)
    except Exception:
        return None

    return user_id


def _get_auth_user(admin_db: Client, user_id: str):
    user_resp = admin_db.auth.admin.get_user_by_id(user_id)
    user = getattr(user_resp, "user", None)
    if not user:
        raise ValueError("User not found")
    return user


def get_user_api_key_metadata(admin_db: Client, user_id: str) -> Dict[str, Any]:
    user = _get_auth_user(admin_db, user_id)
    user_metadata = dict(getattr(user, "user_metadata", None) or {})
    return {
        "has_key": bool(user_metadata.get(META_KEY_HASH)),
        "last4": user_metadata.get(META_KEY_LAST4),
        "created_at": user_metadata.get(META_KEY_CREATED_AT),
    }


def rotate_user_api_key(admin_db: Client, user_id: str) -> Dict[str, Any]:
    user = _get_auth_user(admin_db, user_id)
    user_metadata = dict(getattr(user, "user_metadata", None) or {})

    random_part = secrets.token_urlsafe(32)
    raw_api_key = f"{API_KEY_PREFIX}_{user_id}_{random_part}"
    user_metadata[META_KEY_HASH] = _hash_user_api_key(raw_api_key)
    user_metadata[META_KEY_LAST4] = raw_api_key[-4:]
    user_metadata[META_KEY_CREATED_AT] = datetime.now(timezone.utc).isoformat()

    admin_db.auth.admin.update_user_by_id(
        user_id,
        {
            "user_metadata": user_metadata,
        },
    )

    return {
        "api_key": raw_api_key,
        "last4": user_metadata[META_KEY_LAST4],
        "created_at": user_metadata[META_KEY_CREATED_AT],
    }


def revoke_user_api_key(admin_db: Client, user_id: str) -> Dict[str, Any]:
    user = _get_auth_user(admin_db, user_id)
    user_metadata = dict(getattr(user, "user_metadata", None) or {})
    user_metadata.pop(META_KEY_HASH, None)
    user_metadata.pop(META_KEY_LAST4, None)
    user_metadata.pop(META_KEY_CREATED_AT, None)

    admin_db.auth.admin.update_user_by_id(
        user_id,
        {
            "user_metadata": user_metadata,
        },
    )

    return {"revoked": True}


def validate_user_api_key(admin_db: Client, raw_api_key: str) -> Optional[Dict[str, Any]]:
    user_id = _parse_user_api_key(raw_api_key)
    if not user_id:
        return None

    try:
        user = _get_auth_user(admin_db, user_id)
    except Exception:
        return None

    user_metadata = dict(getattr(user, "user_metadata", None) or {})
    stored_hash = user_metadata.get(META_KEY_HASH)
    if not stored_hash:
        return None

    provided_hash = _hash_user_api_key(raw_api_key)
    if not hmac.compare_digest(str(stored_hash), str(provided_hash)):
        return None

    return {
        "id": getattr(user, "id", None),
        "email": getattr(user, "email", None),
        "user_metadata": user_metadata,
    }
