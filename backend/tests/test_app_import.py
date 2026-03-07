from app.main import app


def test_app_import_smoke() -> None:
    assert app.title == "CineEntry API"
