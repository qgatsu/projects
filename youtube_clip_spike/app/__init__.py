from pathlib import Path

from flask import Flask

from .config import load_app_config
from .routes import register_routes


def create_app() -> Flask:
    app = Flask(__name__)
    app_config = load_app_config()
    app.config.update(app_config)

    @app.context_processor
    def inject_asset_version():
        static_root = Path(app.static_folder or "static").resolve()

        def asset_version(filename: str) -> str:
            try:
                target = (static_root / filename).resolve()
                if not str(target).startswith(str(static_root)):
                    return "0"
                return str(target.stat().st_mtime_ns)
            except OSError:
                return "0"

        return {"asset_version": asset_version}

    register_routes(app)
    return app
