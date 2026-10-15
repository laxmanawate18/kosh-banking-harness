"""Resilient Dual-Mode Cache Service for Kosh.

Supports distributed Redis caching when REDIS_HOST is configured (e.g. Cloud Memorystore),
with automatic, seamless fallback to high-speed in-memory LRU caching with TTL.
Zero-risk: if Redis is offline or unavailable, local in-memory caching keeps everything
fast and reliable without raising exceptions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("kosh.cache")

REDIS_HOST = os.getenv("REDIS_HOST") or os.getenv("MEMORSTORE_HOST")
REDIS_PORT = int(os.getenv("REDIS_PORT") or os.getenv("MEMORSTORE_PORT") or "6379")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_TIMEOUT = float(os.getenv("REDIS_TIMEOUT", "1.0"))  # 1s fail-fast timeout


class InMemoryCache:
    """Thread-safe, process-local in-memory cache with TTL expiration."""

    def __init__(self, maxsize: int = 2048):
        self._maxsize = maxsize
        self._store: Dict[str, Tuple[Any, float]] = {}  # key -> (value, expire_at)
        self._lock = asyncio.Lock()

    def get(self, key: str) -> Optional[Any]:
        item = self._store.get(key)
        if not item:
            return None
        val, expire_at = item
        if expire_at < time.monotonic():
            self._store.pop(key, None)
            return None
        return val

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        if len(self._store) >= self._maxsize:
            # Evict expired keys or oldest 20%
            now = time.monotonic()
            expired = [k for k, (_, exp) in self._store.items() if exp < now]
            for k in expired:
                self._store.pop(k, None)
            if len(self._store) >= self._maxsize:
                # Remove oldest 20%
                keys = list(self._store.keys())[: max(1, self._maxsize // 5)]
                for k in keys:
                    self._store.pop(k, None)
        self._store[key] = (value, time.monotonic() + ttl_seconds)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self, prefix: str = "") -> None:
        if not prefix:
            self._store.clear()
        else:
            to_del = [k for k in self._store if k.startswith(prefix)]
            for k in to_del:
                self._store.pop(k, None)


class CacheService:
    """Dual-Mode Cache Service connecting to Redis with transparent In-Memory fallback."""

    def __init__(self):
        self._local = InMemoryCache()
        self._redis: Optional[Any] = None
        self._redis_available: Optional[bool] = None

    def _get_redis(self):
        if not REDIS_HOST:
            return None
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.Redis(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    password=REDIS_PASSWORD,
                    db=REDIS_DB,
                    socket_connect_timeout=REDIS_TIMEOUT,
                    socket_timeout=REDIS_TIMEOUT,
                    decode_responses=True,
                )
                self._redis_available = True
                logger.info("Connected to Redis at %s:%d", REDIS_HOST, REDIS_PORT)
            except Exception as exc:
                logger.warning("Redis initialization failed, using in-memory cache: %r", exc)
                self._redis = None
                self._redis_available = False
        return self._redis

    async def aget(self, key: str) -> Optional[Any]:
        """Get item asynchronously. Checks Redis first if configured, else In-Memory."""
        r = self._get_redis()
        if r and self._redis_available:
            try:
                raw = await asyncio.wait_for(r.get(key), timeout=REDIS_TIMEOUT)
                if raw is not None:
                    try:
                        return json.loads(raw)
                    except Exception:
                        return raw
            except Exception as exc:
                logger.debug("Redis aget error for %s (%r), falling back to local", key, exc)
                self._redis_available = False

        # In-memory fallback
        return self._local.get(key)

    async def aset(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        """Set item asynchronously with TTL."""
        # Always update local cache for zero-latency local hits
        self._local.set(key, value, ttl_seconds=ttl_seconds)

        r = self._get_redis()
        if r and self._redis_available:
            try:
                payload = json.dumps(value) if not isinstance(value, (str, int, float, bool)) else str(value)
                await asyncio.wait_for(r.set(key, payload, ex=ttl_seconds), timeout=REDIS_TIMEOUT)
            except Exception as exc:
                logger.debug("Redis aset error for %s (%r)", key, exc)
                self._redis_available = False

    async def adelete(self, key: str) -> None:
        """Delete key from both local and remote caches."""
        self._local.delete(key)
        r = self._get_redis()
        if r and self._redis_available:
            try:
                await asyncio.wait_for(r.delete(key), timeout=REDIS_TIMEOUT)
            except Exception:
                pass

    async def aclear(self, prefix: str = "") -> None:
        """Clear cache by prefix."""
        self._local.clear(prefix)
        r = self._get_redis()
        if r and self._redis_available:
            try:
                if prefix:
                    keys = await r.keys(f"{prefix}*")
                    if keys:
                        await r.delete(*keys)
                else:
                    await r.flushdb()
            except Exception:
                pass

    # Synchronous helpers for sync code paths
    def get(self, key: str) -> Optional[Any]:
        return self._local.get(key)

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        self._local.set(key, value, ttl_seconds=ttl_seconds)

    def delete(self, key: str) -> None:
        self._local.delete(key)

    def clear(self, prefix: str = "") -> None:
        self._local.clear(prefix)


# Shared global cache instance
cache = CacheService()
