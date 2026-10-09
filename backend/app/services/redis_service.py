"""
Redis 캐싱 및 OAuth 트랜잭션 서비스
"""

import json
from typing import Optional
import redis.asyncio as redis
from app.config import settings


class RedisService:
    """Redis 캐싱 및 서버 TTL 기반 1회성 OAuth 트랜잭션"""

    OAUTH_STATE_PREFIX = "auth:oauth:state"
    OAUTH_STATE_INDEX_KEY = "auth:oauth:states"
    _STORE_OAUTH_STATE_SCRIPT = """
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZCARD', KEYS[2]) >= limit then
    return 0
end
if not redis.call('SET', KEYS[1], ARGV[1], 'EX', ttl, 'NX') then
    return 0
end
redis.call('ZADD', KEYS[2], now + ttl * 1000, KEYS[1])
local latest = redis.call('ZREVRANGE', KEYS[2], 0, 0, 'WITHSCORES')
redis.call('PEXPIREAT', KEYS[2], tonumber(latest[2]))
return 1
"""
    _CONSUME_OAUTH_STATE_SCRIPT = """
local value = redis.call('GET', KEYS[1])
if not value then
    redis.call('ZREM', KEYS[2], KEYS[1])
    return nil
end
if redis.call('PTTL', KEYS[1]) < 0 then
    return nil
end
local decoded, payload = pcall(cjson.decode, value)
if not decoded or type(payload) ~= 'table' then
    return nil
end
if payload.provider ~= ARGV[1] or payload.transaction_token_hash ~= ARGV[2] then
    return nil
end
if payload.client ~= 'web' and payload.client ~= 'mobile' then
    return nil
end
if payload.code_verifier ~= nil and payload.code_verifier ~= cjson.null
    and type(payload.code_verifier) ~= 'string' then
    return nil
end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], KEYS[1])
return value
"""

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None

    async def connect(self):
        """Redis 연결"""
        if self.redis_client is not None:
            return
        client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        try:
            await client.ping()
        except BaseException:
            await client.aclose()
            raise
        if self.redis_client is None:
            self.redis_client = client
        else:
            # 동시 연결에서 이미 성공한 클라이언트만 소유한다.
            await client.aclose()

    async def disconnect(self):
        """Redis 연결 종료"""
        client = self.redis_client
        self.redis_client = None
        if client:
            await client.aclose()

    def _oauth_state_key(self, state: str) -> str:
        return f"{self.OAUTH_STATE_PREFIX}:{state}"

    async def store_oauth_state(
        self,
        state: str,
        provider: str,
        client: str,
        transaction_token_hash: str,
        ttl_seconds: int,
        max_entries: int,
        code_verifier: str | None = None,
    ) -> bool:
        """발급/상한 검사를 원자적으로 수행하며 유효한 기존 state를 퇴출하지 않는다."""
        if ttl_seconds <= 0 or max_entries <= 0:
            raise ValueError("OAuth transaction limits must be positive")
        if not self.redis_client:
            await self.connect()
        payload = json.dumps(
            {
                "provider": provider,
                "client": client,
                "transaction_token_hash": transaction_token_hash,
                "code_verifier": code_verifier,
            },
            ensure_ascii=False,
        )
        result = await self.redis_client.eval(
            self._STORE_OAUTH_STATE_SCRIPT,
            2,
            self._oauth_state_key(state),
            self.OAUTH_STATE_INDEX_KEY,
            payload,
            ttl_seconds,
            max_entries,
        )
        return result == 1

    async def consume_oauth_state(
        self, state: str, provider: str, transaction_token_hash: str
    ) -> Optional[dict]:
        """provider/proof hash 일치 때만 삭제하며 동시 소비는 하나만 성공한다."""
        if not self.redis_client:
            await self.connect()
        value = await self.redis_client.eval(
            self._CONSUME_OAUTH_STATE_SCRIPT,
            2,
            self._oauth_state_key(state),
            self.OAUTH_STATE_INDEX_KEY,
            provider,
            transaction_token_hash,
        )
        return json.loads(value) if value else None

    async def get(self, key: str) -> Optional[str]:
        """
        캐시에서 값 가져오기

        Args:
            key: 캐시 키

        Returns:
            캐시된 값 (없으면 None)
        """
        if not self.redis_client:
            await self.connect()

        return await self.redis_client.get(key)

    async def set(self, key: str, value: str, ttl: int = 3600):
        """
        캐시에 값 저장

        Args:
            key: 캐시 키
            value: 저장할 값
            ttl: Time To Live (초 단위, default: 3600 = 1시간)
        """
        if not self.redis_client:
            await self.connect()

        await self.redis_client.set(key, value, ex=ttl)

    async def increment(self, key: str, ttl: int) -> int:
        """
        카운터를 1 증가시키고, 첫 생성 시 TTL을 설정합니다.
        """
        if not self.redis_client:
            await self.connect()

        count = await self.redis_client.incr(key)
        if count == 1:
            await self.redis_client.expire(key, ttl)
        return int(count)

    async def ttl(self, key: str) -> int:
        """
        키의 남은 TTL(초)을 반환합니다.
        """
        if not self.redis_client:
            await self.connect()

        ttl = await self.redis_client.ttl(key)
        if ttl is None or ttl < 0:
            return 0
        return int(ttl)

    async def delete(self, key: str):
        """
        캐시에서 값 삭제

        Args:
            key: 캐시 키
        """
        if not self.redis_client:
            await self.connect()

        await self.redis_client.delete(key)

    async def get_json(self, key: str) -> Optional[dict]:
        """
        JSON 형식으로 캐시 가져오기

        Args:
            key: 캐시 키

        Returns:
            dict 형식의 캐시 (없으면 None)
        """
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None

    async def set_json(self, key: str, value: dict, ttl: int = 3600):
        """
        JSON 형식으로 캐시 저장

        Args:
            key: 캐시 키
            value: dict 형식의 값
            ttl: Time To Live (초 단위)
        """
        json_str = json.dumps(value, ensure_ascii=False)
        await self.set(key, json_str, ttl)


# Singleton instance
redis_service = RedisService()


async def get_redis_service() -> RedisService:
    """
    Redis 서비스 인스턴스 가져오기 (Dependency)
    """
    if not redis_service.redis_client:
        await redis_service.connect()
    return redis_service
