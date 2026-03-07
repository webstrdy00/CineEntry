"""
Authentication flow token service
이메일 인증/비밀번호 재설정용 1회성 토큰 저장
"""
from __future__ import annotations

import secrets
from typing import Optional

from app.services.redis_service import redis_service


class AuthFlowService:
    VERIFY_EMAIL_PREFIX = "auth:verify-email:token"
    PASSWORD_RESET_PREFIX = "auth:password-reset:token"
    COOLDOWN_PREFIX = "auth:flow:cooldown"

    def _token_key(self, prefix: str, token: str) -> str:
        return f"{prefix}:{token}"

    def _cooldown_key(self, purpose: str, identity: str) -> str:
        return f"{self.COOLDOWN_PREFIX}:{purpose}:{identity}"

    async def _create_token(self, prefix: str, payload: dict, ttl_seconds: int) -> str:
        token = secrets.token_urlsafe(32)
        await redis_service.set_json(self._token_key(prefix, token), payload, ttl_seconds)
        return token

    async def _peek_token(self, prefix: str, token: str) -> Optional[dict]:
        if not token:
            return None
        return await redis_service.get_json(self._token_key(prefix, token))

    async def _consume_token(self, prefix: str, token: str) -> Optional[dict]:
        payload = await self._peek_token(prefix, token)
        if payload is None:
            return None

        await redis_service.delete(self._token_key(prefix, token))
        return payload

    async def create_email_verification_token(self, user_id: str, email: str, ttl_seconds: int) -> str:
        return await self._create_token(
            self.VERIFY_EMAIL_PREFIX,
            {"user_id": user_id, "email": email},
            ttl_seconds,
        )

    async def consume_email_verification_token(self, token: str) -> Optional[dict]:
        return await self._consume_token(self.VERIFY_EMAIL_PREFIX, token)

    async def create_password_reset_token(self, user_id: str, email: str, ttl_seconds: int) -> str:
        return await self._create_token(
            self.PASSWORD_RESET_PREFIX,
            {"user_id": user_id, "email": email},
            ttl_seconds,
        )

    async def peek_password_reset_token(self, token: str) -> Optional[dict]:
        return await self._peek_token(self.PASSWORD_RESET_PREFIX, token)

    async def consume_password_reset_token(self, token: str) -> Optional[dict]:
        return await self._consume_token(self.PASSWORD_RESET_PREFIX, token)

    async def has_cooldown(self, purpose: str, identity: str) -> bool:
        return bool(await redis_service.get(self._cooldown_key(purpose, identity)))

    async def set_cooldown(self, purpose: str, identity: str, ttl_seconds: int) -> None:
        await redis_service.set(self._cooldown_key(purpose, identity), "1", ttl_seconds)


auth_flow_service = AuthFlowService()
