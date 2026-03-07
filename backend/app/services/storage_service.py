"""
Google Cloud Storage service
비공개 버킷 Signed URL 생성 및 저장 참조값 관리
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

try:
    from google.cloud import storage
except ImportError:  # pragma: no cover - optional dependency at runtime
    storage = None

from app.config import settings


class StorageService:
    """GCS 비공개 버킷 업로드/조회 Signed URL 관리"""

    STORAGE_URI_SCHEME = "gcs"
    STORAGE_ROOT = "cineentry"
    BACKEND_ROOT = Path(__file__).resolve().parents[2]

    def __init__(self):
        self.client = None
        self.bucket = None
        self.bucket_name = settings.GCP_BUCKET_NAME
        self.init_error: Optional[str] = None

        if not self.bucket_name:
            self.init_error = "GCP_BUCKET_NAME not configured"
            print("⚠️  GCS bucket not configured")
            return

        if storage is None:
            self.init_error = "google-cloud-storage package not installed"
            print("⚠️  google-cloud-storage package not installed")
            return

        try:
            credentials_path = self._resolve_credentials_path(settings.GOOGLE_APPLICATION_CREDENTIALS)

            if credentials_path:
                if not credentials_path.exists():
                    raise FileNotFoundError(
                        f"GCS credentials file not found: {credentials_path}"
                    )

                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_path)
                self.client = storage.Client.from_service_account_json(str(credentials_path))
                print(f"✅ GCS credentials loaded: {credentials_path}")
            else:
                self.client = storage.Client()

            self.bucket = self.client.bucket(self.bucket_name)
            print(f"✅ GCS client initialized: {self.bucket_name}")
        except Exception as exc:  # pragma: no cover - depends on environment
            self.init_error = str(exc)
            print(f"⚠️  GCS client initialization failed: {exc}")

    def _resolve_credentials_path(self, raw_path: Optional[str]) -> Optional[Path]:
        if not raw_path:
            return None

        trimmed = raw_path.strip()
        if not trimmed:
            return None

        candidate = Path(trimmed)
        if candidate.is_absolute():
            return candidate

        cwd_candidate = Path.cwd() / candidate
        if cwd_candidate.exists():
            return cwd_candidate.resolve()

        backend_candidate = self.BACKEND_ROOT / candidate
        return backend_candidate.resolve()

    def _require_bucket(self):
        if not self.bucket:
            raise Exception(self.init_error or "GCS client not initialized.")

    def build_user_folder(self, user_id: str, category: str = "uploads") -> str:
        return f"{self.STORAGE_ROOT}/users/{user_id}/{category}".strip("/")

    def build_storage_uri(self, file_key: str) -> str:
        if not self.bucket_name:
            raise Exception("GCP_BUCKET_NAME not configured.")
        return f"{self.STORAGE_URI_SCHEME}://{self.bucket_name}/{file_key.lstrip('/')}"

    def _build_file_key(self, file_name: str, folder: str) -> str:
        safe_name = os.path.basename(file_name or "").strip()
        _, extension = os.path.splitext(safe_name)
        extension = extension.lower() or ".jpg"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"{uuid.uuid4().hex}_{timestamp}{extension}"
        normalized_folder = folder.strip("/")
        return f"{normalized_folder}/{unique_filename}" if normalized_folder else unique_filename

    def extract_file_key(self, file_reference: Optional[str]) -> Optional[str]:
        if not file_reference or not isinstance(file_reference, str):
            return None

        trimmed = file_reference.strip()
        if not trimmed:
            return None

        if trimmed.startswith(("gcs://", "gs://")):
            parsed = urlparse(trimmed)
            if not parsed.netloc:
                return None
            if self.bucket_name and parsed.netloc != self.bucket_name:
                return None
            return parsed.path.lstrip("/") or None

        parsed = urlparse(trimmed)
        if parsed.scheme not in {"http", "https"}:
            return None

        host = parsed.netloc.lower()
        path = parsed.path.lstrip("/")
        bucket_host = f"{(self.bucket_name or '').lower()}.storage.googleapis.com"

        if self.bucket_name and host in {"storage.googleapis.com", "storage.cloud.google.com"}:
            prefix = f"{self.bucket_name}/"
            if path.startswith(prefix):
                return unquote(path[len(prefix):]) or None

            download_prefix = f"download/storage/v1/b/{self.bucket_name}/o/"
            if path.startswith(download_prefix):
                return unquote(path[len(download_prefix):]) or None

        if self.bucket_name and host == bucket_host:
            return unquote(path) or None

        return None

    def is_managed_reference(self, file_reference: Optional[str]) -> bool:
        return self.extract_file_key(file_reference) is not None

    def normalize_storage_reference(self, file_reference: Optional[str]) -> Optional[str]:
        if file_reference is None:
            return None

        trimmed = file_reference.strip()
        if not trimmed:
            return None

        file_key = self.extract_file_key(trimmed)
        if not file_key:
            return trimmed

        return self.build_storage_uri(file_key)

    def is_user_owned_reference(self, file_reference: Optional[str], user_id: str) -> bool:
        file_key = self.extract_file_key(file_reference)
        if not file_key:
            return False
        expected_prefix = f"{self.STORAGE_ROOT}/users/{user_id}/"
        return file_key.startswith(expected_prefix)

    def generate_upload_url(
        self,
        *,
        file_name: str,
        file_type: str,
        folder: str,
        expiration: int,
    ) -> dict[str, str]:
        self._require_bucket()

        file_key = self._build_file_key(file_name=file_name, folder=folder)
        blob = self.bucket.blob(file_key)

        upload_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=expiration),
            method="PUT",
            content_type=file_type,
        )

        return {
            "upload_url": upload_url,
            "file_url": self.generate_download_url(file_key, expiration=expiration),
            "file_key": file_key,
            "storage_url": self.build_storage_uri(file_key),
        }

    def upload_bytes(
        self,
        *,
        file_name: str,
        file_type: str,
        content: bytes,
        folder: str,
    ) -> dict[str, str]:
        self._require_bucket()

        file_key = self._build_file_key(file_name=file_name, folder=folder)
        blob = self.bucket.blob(file_key)
        blob.upload_from_string(content, content_type=file_type)

        return {
            "file_url": self.generate_download_url(file_key),
            "file_key": file_key,
            "storage_url": self.build_storage_uri(file_key),
        }

    def generate_download_url(self, file_reference: str, expiration: Optional[int] = None) -> str:
        self._require_bucket()

        file_key = self.extract_file_key(file_reference) or file_reference.lstrip("/")
        blob = self.bucket.blob(file_key)
        effective_expiration = expiration or settings.GCP_SIGNED_URL_EXPIRATION_SECONDS

        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=effective_expiration),
            method="GET",
        )

    def resolve_file_url(self, file_reference: Optional[str], expiration: Optional[int] = None) -> Optional[str]:
        if not file_reference:
            return file_reference

        if not self.is_managed_reference(file_reference):
            return file_reference

        try:
            return self.generate_download_url(file_reference, expiration=expiration)
        except Exception as exc:  # pragma: no cover - depends on environment
            print(f"⚠️  Signed download URL generation failed: {exc}")
            return file_reference

    def delete_file(self, file_reference: Optional[str]) -> bool:
        file_key = self.extract_file_key(file_reference)
        if not file_key:
            return False

        if not self.bucket:
            print(f"⚠️  GCS delete skipped (client unavailable): {file_key}")
            return False

        try:
            self.bucket.blob(file_key).delete()
            print(f"✅ GCS file deleted: {file_key}")
            return True
        except Exception as exc:  # pragma: no cover - depends on environment
            print(f"⚠️  GCS file delete failed: {exc}")
            return False


storage_service = StorageService()
