"""Helpers to run slow side-effects without blocking the request."""

import asyncio
import traceback
from collections.abc import Coroutine
from typing import Any, Callable

_background_tasks: set[asyncio.Task] = set()
# Serializes Google Sheets syncs: find-then-update in gspread is not atomic,
# so concurrent syncs could reorder statuses or append duplicate rows.
# asyncio.Lock wakes waiters in FIFO order, preserving enqueue order.
_serial_lock = asyncio.Lock()


def _on_task_done(task: asyncio.Task) -> None:
    _background_tasks.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        print(f"Background task failed: {exc}")
        traceback.print_exception(exc)


def fire_and_forget(coro: Coroutine[Any, Any, Any]) -> None:
    """Schedule a coroutine in the background, keeping a reference until done."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_on_task_done)


def run_blocking_in_background(func: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
    """Run a synchronous (blocking) function in a worker thread, fire-and-forget.

    Used for gspread calls: they perform blocking HTTP requests that would
    otherwise freeze the whole event loop for seconds. Executions are
    serialized in submission order (see _serial_lock).
    """

    async def _run() -> None:
        async with _serial_lock:
            await asyncio.to_thread(func, *args, **kwargs)

    fire_and_forget(_run())


async def drain_background_tasks(timeout: float = 10.0) -> None:
    """Give pending background work a chance to finish before shutdown."""
    pending = [t for t in _background_tasks if not t.done()]
    if pending:
        await asyncio.wait(pending, timeout=timeout)
