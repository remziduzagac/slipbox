"""App factory for the Kestrel API: a Flask-like micro framework, small enough to read in one sitting."""
from __future__ import annotations

import asyncio
import os
from functools import wraps

from .models import Route


class App:
    def __init__(self, name):
        self.name = name
        self.routes = {}
        self.hooks = []

    def route(self, path, methods=("GET",)):
        def deco(fn):
            self.routes[(path, methods)] = fn
            return fn

        return deco

    def before_request(self, fn):
        self.hooks.append(fn)
        return fn


def require_token(fn):
    @wraps(fn)
    async def wrapper(*args, **kwargs):
        token = os.environ.get("KESTREL_TOKEN")
        if not token:
            raise PermissionError("KESTREL_TOKEN is not set")
        return await fn(*args, **kwargs)

    return wrapper


def create_app(env: str = "dev") -> App:
    app = App("kestrel_api")

    @app.before_request
    def log_request(request):
        # TODO: structured logging once Malik's collector is in
        print(request)

    @app.route("/routes")
    async def list_routes():
        await asyncio.sleep(0)
        return [Route(id="r1", name="Harbour loop", km=42.0)]

    @app.route("/routes/<id>", methods=("GET", "DELETE"))
    @require_token
    async def one_route(id):
        return {"id": id}

    @app.route("/health")
    def health():
        return {"ok": True, "env": env}

    return app


async def serve(app: App, port: int = 8080) -> None:
    print(f"serving {app.name} on {port}")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(serve(create_app(os.environ.get("KESTREL_ENV", "dev"))))
