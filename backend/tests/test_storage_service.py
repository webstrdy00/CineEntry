from unittest.mock import MagicMock

from google.api_core.exceptions import Forbidden, NotFound

from app.services.storage_service import StorageService


def _make_service(bucket_name: str = "cineentry-images") -> StorageService:
    service = StorageService.__new__(StorageService)
    service.bucket_name = bucket_name
    service.bucket = None
    return service


def test_extract_file_key_from_storage_uri():
    service = _make_service()

    assert (
        service.extract_file_key(
            "gcs://cineentry-images/cineentry/users/user-1/uploads/test.jpg"
        )
        == "cineentry/users/user-1/uploads/test.jpg"
    )


def test_extract_file_key_from_signed_googleapis_url():
    service = _make_service()

    signed_url = (
        "https://storage.googleapis.com/cineentry-images/"
        "cineentry/users/user-1/uploads/test.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256"
    )

    assert (
        service.extract_file_key(signed_url)
        == "cineentry/users/user-1/uploads/test.jpg"
    )


def test_extract_file_key_from_download_api_url():
    service = _make_service()

    download_url = (
        "https://storage.googleapis.com/download/storage/v1/b/cineentry-images/o/"
        "cineentry%2Fusers%2Fuser-1%2Fuploads%2Ftest.jpg?alt=media"
    )

    assert (
        service.extract_file_key(download_url)
        == "cineentry/users/user-1/uploads/test.jpg"
    )


def test_normalize_storage_reference_converts_signed_url_to_gcs_uri():
    service = _make_service()

    signed_url = (
        "https://storage.googleapis.com/cineentry-images/"
        "cineentry/users/user-1/uploads/test.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256"
    )

    assert (
        service.normalize_storage_reference(signed_url)
        == "gcs://cineentry-images/cineentry/users/user-1/uploads/test.jpg"
    )


def test_is_user_owned_reference_checks_user_prefix():
    service = _make_service()

    own_reference = "gcs://cineentry-images/cineentry/users/user-1/uploads/test.jpg"
    other_reference = "gcs://cineentry-images/cineentry/users/user-2/uploads/test.jpg"

    assert service.is_user_owned_reference(own_reference, "user-1") is True
    assert service.is_user_owned_reference(other_reference, "user-1") is False


def test_delete_missing_object_is_idempotent():
    service = _make_service()
    service.bucket = MagicMock()
    service.bucket.blob.return_value.delete.side_effect = NotFound("absent")

    assert service.delete_file(
        "gcs://cineentry-images/cineentry/users/user-1/uploads/test.jpg"
    )
    service.bucket.blob.return_value.delete.assert_called_once()


def test_delete_permission_failure_is_not_reported_as_success(capsys):
    service = _make_service()
    service.bucket = MagicMock()
    service.bucket.blob.return_value.delete.side_effect = Forbidden(
        "private-object-detail"
    )

    assert not service.delete_file(
        "gcs://cineentry-images/cineentry/users/user-1/uploads/test.jpg"
    )
    output = capsys.readouterr().out
    assert "Forbidden" in output
    assert "private-object-detail" not in output
    assert "user-1" not in output
