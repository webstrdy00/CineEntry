import asyncio
from threading import Event
from unittest.mock import AsyncMock

from app import main


def test_worker_retries_after_failure_and_stops(monkeypatch, caplog):
    calls = []

    async def scenario():
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()

        def process(*, batch_size):
            calls.append(batch_size)
            if len(calls) == 1:
                raise RuntimeError("private-storage-credentials")
            loop.call_soon_threadsafe(stop.set)
            return 1

        original_wait = asyncio.wait_for

        async def quick_wait(awaitable, timeout):
            return await original_wait(awaitable, timeout=0.01)

        monkeypatch.setattr(main, "process_cleanup_jobs", process)
        monkeypatch.setattr(main.asyncio, "wait_for", quick_wait)
        await main._run_media_cleanup(stop)

    asyncio.run(scenario())
    assert calls == [1, 1]
    assert "private-storage-credentials" not in caplog.text


def test_worker_shutdown_waits_for_inflight_job(monkeypatch):
    started, release, finished = Event(), Event(), Event()

    def process(*, batch_size):
        started.set()
        if not release.wait(5):
            raise RuntimeError("Test failed to release worker")
        finished.set()
        return 1

    async def scenario():
        stop = asyncio.Event()
        monkeypatch.setattr(main, "process_cleanup_jobs", process)
        task = asyncio.create_task(main._run_media_cleanup(stop))
        try:
            assert await asyncio.to_thread(started.wait, 5)
            stop.set()
            await asyncio.sleep(0)
            assert not task.done()
        finally:
            release.set()
            await asyncio.wait_for(task, timeout=5)
        assert finished.is_set()

    asyncio.run(scenario())


def test_lifespan_stops_worker_and_disconnects_on_application_failure(monkeypatch):
    connect, disconnect = AsyncMock(), AsyncMock()
    stopped = []

    async def worker(stop):
        await stop.wait()
        stopped.append(True)

    monkeypatch.setattr(main.redis_service, "connect", connect)
    monkeypatch.setattr(main.redis_service, "disconnect", disconnect)
    monkeypatch.setattr(main, "_run_media_cleanup", worker)
    monkeypatch.setattr(type(main.settings), "validate_production", lambda self: None)

    async def scenario():
        try:
            async with main.lifespan(main.app):
                raise RuntimeError("application stopped")
        except RuntimeError as exc:
            assert str(exc) == "application stopped"

    asyncio.run(scenario())
    assert stopped == [True]
    connect.assert_awaited_once()
    disconnect.assert_awaited_once()
