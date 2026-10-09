"""OAuth Redis protocol tests and opt-in local audit scenarios.

Real Redis scenarios require CINEENTRY_OAUTH_REDIS_TESTS=1 and an explicit
CINEENTRY_OAUTH_REDIS_URL=redis://127.0.0.1:16389/15. Only the loopback audit
port and dedicated DB 15 are permitted. Every scenario uses its own namespace
and deletes only its recorded keys; no scan, flush, external OAuth or DB access.
"""

import asyncio
import hashlib
import json
import os
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
import redis.asyncio as redis
from fastapi import HTTPException
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.v1 import auth as auth_api
from app.config import settings
from app.services import redis_service as redis_module
from app.services.redis_service import RedisService

_PROOF = "synthetic-audit-device-proof-" + "p" * 32
_PROOF_HASH = hashlib.sha256(_PROOF.encode("utf-8")).hexdigest()


def _check(condition: bool, message: str) -> None:
    if not condition:
        # Avoid assertion rewriting that could print transaction payloads.
        pytest.fail(message, pytrace=False)


def _guard_audit_redis_url(url: str) -> None:
    try:
        parsed = urlsplit(url)
        safe = (
            parsed.scheme == "redis"
            and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            and parsed.port == 16389
            and parsed.path == "/15"
            and parsed.username is None
            and parsed.password is None
            and not parsed.query
            and not parsed.fragment
        )
    except (TypeError, ValueError):
        safe = False
    if not safe:
        raise ValueError(
            "OAuth Redis audit requires loopback port 16389, dedicated DB 15, "
            "and no credentials or URL overrides (connection values redacted)"
        )


@pytest.mark.parametrize(
    "url",
    [
        "",
        "redis://127.0.0.1:6379/15",
        "redis://127.0.0.1:16389/0",
        "redis://127.0.0.1:16389/",
        "redis://127.0.0.1:16389/015",
        "redis://remote.example:16389/15",
        "rediss://127.0.0.1:16389/15",
        "redis://user:private-password@127.0.0.1:16389/15",
        "redis://127.0.0.1:16389/15?db=0",
        "redis://127.0.0.1:16389/15#override",
        "redis://127.0.0.1:not-a-port/15",
    ],
)
def test_audit_guard_rejects_unsafe_endpoints_without_printing_values(url) -> None:
    with pytest.raises(ValueError) as exc_info:
        _guard_audit_redis_url(url)
    assert "connection values redacted" in str(exc_info.value)
    assert "private-password" not in str(exc_info.value)


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]"])
def test_audit_guard_accepts_only_dedicated_local_database(host) -> None:
    _guard_audit_redis_url(f"redis://{host}:16389/15")


def test_store_sends_hash_only_payload_and_limits_in_one_script() -> None:
    service = RedisService()
    client = AsyncMock()
    client.eval.return_value = 1
    service.redis_client = client

    stored = asyncio.run(
        service.store_oauth_state(
            "test-state", "google", "mobile", _PROOF_HASH, 17, 4, "test-verifier"
        )
    )

    assert stored is True
    client.eval.assert_awaited_once()
    args = client.eval.call_args.args
    assert args[:4] == (
        service._STORE_OAUTH_STATE_SCRIPT,
        2,
        service._oauth_state_key("test-state"),
        service.OAUTH_STATE_INDEX_KEY,
    )
    payload = json.loads(args[4])
    assert payload == {
        "provider": "google",
        "client": "mobile",
        "transaction_token_hash": _PROOF_HASH,
        "code_verifier": "test-verifier",
    }
    assert _PROOF not in args[4]
    assert "created_at" not in payload
    assert args[5:] == (17, 4)


@pytest.mark.parametrize("result", [0, None])
def test_store_rejection_does_not_use_a_fallback(result) -> None:
    service = RedisService()
    client = AsyncMock()
    client.eval.return_value = result
    service.redis_client = client
    assert (
        asyncio.run(
            service.store_oauth_state("test-state", "kakao", "web", _PROOF_HASH, 17, 4)
        )
        is False
    )
    client.eval.assert_awaited_once()


@pytest.mark.parametrize("ttl,limit", [(0, 4), (-1, 4), (17, 0), (17, -1)])
def test_invalid_limits_fail_before_connect(ttl, limit) -> None:
    service = RedisService()
    service.connect = AsyncMock()
    with pytest.raises(ValueError):
        asyncio.run(
            service.store_oauth_state(
                "test-state", "google", "mobile", _PROOF_HASH, ttl, limit
            )
        )
    service.connect.assert_not_awaited()


@pytest.mark.parametrize("present", [True, False])
def test_consume_sends_provider_and_hash_in_one_script(present) -> None:
    service = RedisService()
    payload = {"client": "mobile", "code_verifier": "test-verifier"}
    client = AsyncMock()
    client.eval.return_value = json.dumps(payload) if present else None
    service.redis_client = client

    result = asyncio.run(
        service.consume_oauth_state("test-state", "google", _PROOF_HASH)
    )

    assert result == (payload if present else None)
    client.eval.assert_awaited_once_with(
        service._CONSUME_OAUTH_STATE_SCRIPT,
        2,
        service._oauth_state_key("test-state"),
        service.OAUTH_STATE_INDEX_KEY,
        "google",
        _PROOF_HASH,
    )


def test_connect_publishes_only_a_successfully_pinged_client(monkeypatch) -> None:
    service = RedisService()
    client = AsyncMock()

    async def ping():
        assert service.redis_client is None
        return True

    client.ping.side_effect = ping
    factory = Mock(return_value=client)
    monkeypatch.setattr(redis_module.redis, "from_url", factory)
    asyncio.run(service.connect())

    assert service.redis_client is client
    client.ping.assert_awaited_once()
    client.aclose.assert_not_awaited()
    assert factory.call_args.kwargs["socket_connect_timeout"] == 5
    assert factory.call_args.kwargs["socket_timeout"] == 5


def test_failed_connect_closes_client_and_allows_retry(monkeypatch) -> None:
    service = RedisService()
    failed_client = AsyncMock()
    failed_client.ping.side_effect = RedisConnectionError(
        "synthetic connection failure"
    )
    replacement = AsyncMock()
    factory = Mock(side_effect=[failed_client, replacement])
    monkeypatch.setattr(redis_module.redis, "from_url", factory)

    async def scenario():
        with pytest.raises(RedisConnectionError):
            await service.connect()
        assert service.redis_client is None
        await service.connect()
        assert service.redis_client is replacement

    asyncio.run(scenario())
    failed_client.aclose.assert_awaited_once()
    replacement.ping.assert_awaited_once()


def test_disconnect_clears_ownership_and_reconnects(monkeypatch) -> None:
    service = RedisService()
    previous = AsyncMock()
    replacement = AsyncMock()
    service.redis_client = previous
    monkeypatch.setattr(redis_module.redis, "from_url", Mock(return_value=replacement))

    async def scenario():
        await service.disconnect()
        assert service.redis_client is None
        await service.connect()
        assert service.redis_client is replacement
        await service.disconnect()
        await service.disconnect()

    asyncio.run(scenario())
    previous.aclose.assert_awaited_once()
    replacement.aclose.assert_awaited_once()
    assert service.redis_client is None


def test_concurrent_connect_closes_the_unowned_client(monkeypatch) -> None:
    service = RedisService()
    clients = [AsyncMock(), AsyncMock()]

    async def ping():
        await asyncio.sleep(0)
        return True

    for client in clients:
        client.ping.side_effect = ping
    monkeypatch.setattr(redis_module.redis, "from_url", Mock(side_effect=clients))

    async def scenario():
        await asyncio.gather(service.connect(), service.connect())
        assert service.redis_client is clients[0]
        clients[1].aclose.assert_awaited_once()
        await service.disconnect()

    asyncio.run(scenario())
    clients[0].aclose.assert_awaited_once()


@pytest.fixture
def audit_redis_url(monkeypatch):
    if os.environ.get("CINEENTRY_OAUTH_REDIS_TESTS") != "1":
        pytest.skip("Real OAuth Redis audit is explicitly opt-in")
    url = os.environ.get("CINEENTRY_OAUTH_REDIS_URL", "")
    _guard_audit_redis_url(url)
    monkeypatch.setattr(settings, "REDIS_URL", url)
    return url


@asynccontextmanager
async def _audit_services(url):
    _guard_audit_redis_url(url)
    namespace = f"auth:oauth:audit:{uuid4().hex}"
    first, second = RedisService(), RedisService()
    index = f"{namespace}:index"
    owned_keys = {index}
    for service in (first, second):
        service.OAUTH_STATE_PREFIX = f"{namespace}:state"
        service.OAUTH_STATE_INDEX_KEY = index

    def new_state():
        state = uuid4().hex
        owned_keys.add(first._oauth_state_key(state))
        return state

    try:
        await first.connect()
        await second.connect()
        yield first, second, new_state
    finally:
        cleanup = redis.from_url(
            url, decode_responses=True, socket_connect_timeout=5, socket_timeout=5
        )
        try:
            await cleanup.delete(*owned_keys)
        finally:
            await cleanup.aclose()
            await first.disconnect()
            await second.disconnect()


@pytest.mark.parametrize("provider", ["google", "kakao"])
@pytest.mark.parametrize("client", ["mobile", "web"])
def test_real_redis_cross_client_and_application_service_restart(
    audit_redis_url, monkeypatch, provider, client
) -> None:
    monkeypatch.setattr(settings, "OAUTH_STATE_TTL_SECONDS", 10)
    monkeypatch.setattr(settings, "OAUTH_STATE_MAX_ENTRIES", 3)
    verifier = "synthetic-pkce-verifier" if provider == "google" else None

    async def scenario():
        async with _audit_services(audit_redis_url) as (first, second, new_state):
            state = new_state()
            monkeypatch.setattr(auth_api, "redis_service", first)
            await auth_api._store_oauth_state(
                state,
                provider,
                client,
                transaction_token=_PROOF,
                code_verifier=verifier,
            )
            key = first._oauth_state_key(state)
            raw = await first.redis_client.get(key)
            _check(raw is not None and _PROOF not in raw, "Plaintext proof stored")
            payload = json.loads(raw)
            _check(
                payload.get("transaction_token_hash") == _PROOF_HASH,
                "Transaction proof hash missing",
            )
            _check("created_at" not in payload, "Process-local clock stored")
            _check(
                0 < await first.redis_client.ttl(key) <= 10,
                "Transaction is missing its server TTL",
            )
            await first.disconnect()
            _check(first.redis_client is None, "Restart retained old Redis client")
            monkeypatch.setattr(auth_api, "redis_service", second)
            result = await auth_api._consume_oauth_state(state, provider, _PROOF)
            _check(result == (client, verifier), "Restart lost client/PKCE binding")
            await first.connect()
            _check(
                await first.consume_oauth_state(state, provider, _PROOF_HASH) is None,
                "Consumed state was replayed through another client",
            )
            _check(
                await second.redis_client.zcard(second.OAUTH_STATE_INDEX_KEY) == 0,
                "Successful consume did not release capacity",
            )

    asyncio.run(scenario())


def test_real_redis_invalid_proofs_preserve_state_and_concurrent_consume_has_one_winner(
    audit_redis_url,
) -> None:
    async def scenario():
        async with _audit_services(audit_redis_url) as (first, second, new_state):
            state = new_state()
            _check(
                await first.store_oauth_state(
                    state, "google", "mobile", _PROOF_HASH, 10, 4, "synthetic-verifier"
                ),
                "Transaction was not stored",
            )
            key = first._oauth_state_key(state)
            before = await first.redis_client.get(key)
            for provider, proof_hash in (("kakao", _PROOF_HASH), ("google", "0" * 64)):
                _check(
                    await second.consume_oauth_state(state, provider, proof_hash)
                    is None,
                    "Invalid provider/proof was accepted",
                )
                _check(
                    await first.redis_client.get(key) == before,
                    "Invalid provider/proof consumed or changed the valid state",
                )
                _check(
                    await first.redis_client.zcard(first.OAUTH_STATE_INDEX_KEY) == 1,
                    "Invalid proof released outstanding capacity",
                )
            results = await asyncio.gather(
                *(
                    service.consume_oauth_state(state, "google", _PROOF_HASH)
                    for service in [first, second] * 10
                )
            )
            _check(
                sum(result is not None for result in results) == 1,
                "Concurrent consumers did not have exactly one winner",
            )
            _check(
                await first.redis_client.get(key) is None, "Winning consume kept state"
            )
            _check(
                await first.redis_client.zcard(first.OAUTH_STATE_INDEX_KEY) == 0,
                "Winning consume kept its capacity entry",
            )

    asyncio.run(scenario())


def test_real_redis_expiry_releases_capacity_without_evicting_live_state(
    audit_redis_url,
) -> None:
    async def scenario():
        async with _audit_services(audit_redis_url) as (first, second, new_state):
            expired, live, rejected, replacement = [new_state() for _ in range(4)]
            _check(
                await second.store_oauth_state(
                    live, "google", "web", _PROOF_HASH, 10, 2, "synthetic-verifier"
                ),
                "Live transaction was not stored",
            )
            _check(
                await first.store_oauth_state(
                    expired, "kakao", "mobile", _PROOF_HASH, 1, 2
                ),
                "Short transaction was not stored",
            )
            _check(
                not await first.store_oauth_state(
                    rejected, "kakao", "mobile", _PROOF_HASH, 10, 2
                ),
                "Capacity did not reject excess transaction",
            )
            live_key = first._oauth_state_key(live)
            saved_live = await first.redis_client.get(live_key)
            _check(saved_live is not None, "Capacity rejection evicted a live state")

            async def wait_for_server_expiry():
                while await first.redis_client.exists(first._oauth_state_key(expired)):
                    await asyncio.sleep(0.05)

            await asyncio.wait_for(wait_for_server_expiry(), timeout=3)
            _check(
                await second.store_oauth_state(
                    replacement, "kakao", "mobile", _PROOF_HASH, 10, 2
                ),
                "Server expiry did not free capacity on the next store",
            )
            _check(
                await first.redis_client.get(live_key) == saved_live,
                "Expiry pruning changed a live transaction",
            )
            _check(
                await first.redis_client.zcard(first.OAUTH_STATE_INDEX_KEY) == 2,
                "Expiry pruning did not keep the bounded outstanding set",
            )
            _check(
                await second.consume_oauth_state(expired, "kakao", _PROOF_HASH) is None,
                "Expired state was accepted",
            )
            _check(
                await first.redis_client.exists(first._oauth_state_key(rejected)) == 0,
                "Rejected transaction created a Redis state key",
            )

    asyncio.run(scenario())


def test_real_redis_cross_client_capacity_limit_is_atomic(audit_redis_url) -> None:
    async def scenario():
        async with _audit_services(audit_redis_url) as (first, second, new_state):
            states = [new_state() for _ in range(20)]
            results = await asyncio.gather(
                *(
                    (first if index % 2 else second).store_oauth_state(
                        state, "kakao", "mobile", _PROOF_HASH, 10, 3
                    )
                    for index, state in enumerate(states)
                )
            )
            _check(sum(results) == 3, "Concurrent issuance exceeded or lost capacity")
            _check(
                await first.redis_client.zcard(first.OAUTH_STATE_INDEX_KEY) == 3,
                "Outstanding index exceeded the shared limit",
            )
            for state, accepted in zip(states, results):
                present = await second.redis_client.exists(
                    second._oauth_state_key(state)
                )
                _check(bool(present) == accepted, "Rejected issuance left a state key")
            winner = states[results.index(True)]
            _check(
                await second.consume_oauth_state(winner, "kakao", _PROOF_HASH)
                is not None,
                "Accepted issuance could not be consumed",
            )
            _check(
                await first.store_oauth_state(
                    new_state(), "kakao", "web", _PROOF_HASH, 10, 3
                ),
                "Successful consume did not free shared issuance capacity",
            )

    asyncio.run(scenario())


def test_real_redis_existing_state_is_never_overwritten(audit_redis_url) -> None:
    async def scenario():
        async with _audit_services(audit_redis_url) as (first, second, new_state):
            state = new_state()
            _check(
                await first.store_oauth_state(
                    state, "google", "mobile", _PROOF_HASH, 10, 3, "synthetic-verifier"
                ),
                "Initial transaction was not stored",
            )
            _check(
                not await second.store_oauth_state(
                    state, "kakao", "web", "0" * 64, 10, 3
                ),
                "Duplicate state overwrote a valid transaction",
            )
            result = await second.consume_oauth_state(state, "google", _PROOF_HASH)
            _check(
                result is not None
                and result.get("client") == "mobile"
                and result.get("code_verifier") == "synthetic-verifier",
                "Duplicate issuance changed provider/client/PKCE binding",
            )

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "corruption", ["not-json", "null", "[]", "invalid-client", "missing-ttl"]
)
def test_real_redis_corrupt_payload_fails_closed_without_consuming(
    audit_redis_url, monkeypatch, corruption
) -> None:
    async def scenario():
        async with _audit_services(audit_redis_url) as (first, second, new_state):
            state = new_state()
            _check(
                await first.store_oauth_state(
                    state, "kakao", "mobile", _PROOF_HASH, 10, 3
                ),
                "Initial transaction was not stored",
            )
            key = first._oauth_state_key(state)
            value = corruption
            if corruption in {"invalid-client", "missing-ttl"}:
                payload = json.loads(await first.redis_client.get(key))
                if corruption == "invalid-client":
                    payload["client"] = "untrusted-redirect-target"
                value = json.dumps(payload)
            await first.redis_client.set(
                key, value, keepttl=corruption != "missing-ttl"
            )
            monkeypatch.setattr(auth_api, "redis_service", second)
            try:
                await auth_api._consume_oauth_state(state, "kakao", _PROOF)
            except HTTPException as exc:
                _check(exc.status_code == 400, "Corrupt state returned an unsafe error")
                _check(value not in exc.detail, "Corrupt payload leaked in the error")
            else:
                _check(False, "Corrupt state was accepted")
            _check(
                await first.redis_client.get(key) == value,
                "Corrupt transaction was unexpectedly consumed",
            )

    asyncio.run(scenario())
