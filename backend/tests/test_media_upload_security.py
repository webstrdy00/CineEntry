from unittest.mock import Mock

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1 import media
from app.config import settings
from app.services.storage_service import StorageService


@pytest.fixture
def upload_client(monkeypatch):
    storage = Mock(spec=StorageService)
    storage.build_user_folder.return_value = "cineentry/users/user-1/uploads"
    storage.upload_bytes.return_value = {
        "file_url": "https://example.com/preview",
        "file_key": "cineentry/users/user-1/uploads/image.png",
        "storage_url": "gcs://test-bucket/cineentry/users/user-1/uploads/image.png",
    }
    monkeypatch.setattr(media, "storage_service", storage)
    monkeypatch.setattr(settings, "MAX_IMAGE_UPLOAD_BYTES", 16)
    monkeypatch.setattr(media, "UPLOAD_READ_CHUNK_BYTES", 8)

    app = FastAPI()
    app.include_router(media.router, prefix="/api/v1")
    app.dependency_overrides[media.get_current_user_id] = lambda: "user-1"

    with TestClient(app) as client:
        yield client, storage


def test_signed_put_upload_route_is_unavailable(upload_client) -> None:
    client, storage = upload_client

    response = client.post(
        "/api/v1/media/upload",
        json={"file_name": "image.png", "file_type": "image/png", "file_size": 1},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "/api/v1/media/upload" not in client.app.openapi()["paths"]
    assert storage.method_calls == []


@pytest.mark.parametrize(
    ("content", "content_type", "expected_status", "expected_detail"),
    [
        (
            b"\x89PNG\r\n\x1a\n123456789",
            "image/png",
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "이미지는 16B 이하 파일만 업로드할 수 있습니다.",
        ),
        (
            b"",
            "image/png",
            status.HTTP_400_BAD_REQUEST,
            "빈 파일은 업로드할 수 없습니다.",
        ),
        (
            b"\x89PNG\r\n\x1a\n12345678",
            "image/jpeg",
            status.HTTP_400_BAD_REQUEST,
            "파일 내용이 이미지 형식과 일치하지 않습니다.",
        ),
        (
            b"not an image",
            "image/png",
            status.HTTP_400_BAD_REQUEST,
            "파일 내용이 이미지 형식과 일치하지 않습니다.",
        ),
        (
            b"RIFF",
            "image/webp",
            status.HTTP_400_BAD_REQUEST,
            "파일 내용이 이미지 형식과 일치하지 않습니다.",
        ),
        (
            b"\x89PNG\r\n\x1a\n12345678",
            "application/octet-stream",
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 파일 형식입니다. 허용: image/jpeg, image/jpg, image/png, image/webp",
        ),
    ],
    ids=[
        "oversized",
        "empty",
        "mismatched-type",
        "non-image",
        "truncated-webp",
        "unsupported-type",
    ],
)
def test_upload_file_rejects_invalid_content_without_storage(
    upload_client, content, content_type, expected_status, expected_detail
) -> None:
    client, storage = upload_client

    response = client.post(
        "/api/v1/media/upload-file",
        files={"file": ("image.png", content, content_type)},
    )

    assert response.status_code == expected_status
    assert response.json()["detail"] == expected_detail
    assert storage.method_calls == []


@pytest.mark.parametrize(
    ("content", "content_type"),
    [
        (b"\x89PNG\r\n\x1a\n12345678", "image/png"),
        (b"\xff\xd8\xff1234567890123", "image/jpeg"),
        (b"\xff\xd8\xff1234567890123", "image/jpg"),
        (b"RIFF1234WEBP1234", "image/webp"),
    ],
)
def test_upload_file_accepts_matching_signature_at_size_limit(
    upload_client, content, content_type
) -> None:
    client, storage = upload_client

    response = client.post(
        "/api/v1/media/upload-file",
        files={"file": ("image.png", content, content_type)},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "success": True,
        "message": "파일이 업로드되었습니다.",
        "data": storage.upload_bytes.return_value,
    }
    storage.build_user_folder.assert_called_once_with(user_id="user-1")
    storage.upload_bytes.assert_called_once_with(
        file_name="image.png",
        file_type=content_type,
        content=content,
        folder="cineentry/users/user-1/uploads",
    )
