"""Shop domain errors → {"error", "code"} JSON (port of KraTte http-error).

Raised by app/shop/* service code; translated to responses by the
ShopError handler installed in app.main. Human sentence in `error`,
machine code in `code`, correct 4xx in status. Never a stack trace.
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class ShopError(Exception):
    def __init__(self, message: str, status: int = 422, code: str = "VALIDATION_ERROR"):
        self.message = message
        self.status = status
        self.code = code
        super().__init__(message)


class NotFound(ShopError):
    def __init__(self, message: str = "Not found."):
        super().__init__(message, 404, "NOT_FOUND")


class Conflict(ShopError):
    def __init__(self, message: str, code: str = "CONFLICT"):
        super().__init__(message, 409, code)


class NoShop(ShopError):
    def __init__(self):
        super().__init__("Start your shop first — then this has a home.", 403, "NO_SHOP")


async def shop_error_handler(_: Request, e: ShopError) -> JSONResponse:
    return JSONResponse(status_code=e.status, content={"error": e.message, "code": e.code})
