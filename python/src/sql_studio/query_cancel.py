"""Query cancellation helpers."""

from __future__ import annotations


class QueryCancelledError(Exception):
    """Raised when a running query is cancelled by the user."""


def is_query_cancelled_error(exc: BaseException) -> bool:
    if isinstance(exc, QueryCancelledError):
        return True
    message = str(exc).lower()
    return "cancel" in message or "query_canceled" in message or "query canceled" in message
