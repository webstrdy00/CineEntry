from app.services.storage_service import StorageService


def _make_service(bucket_name: str = "cineentry-images") -> StorageService:
    service = StorageService()
    service.bucket_name = bucket_name
    return service


def test_extract_file_key_from_storage_uri():
    service = _make_service()

    assert (
        service.extract_file_key("gcs://cineentry-images/cineentry/users/user-1/uploads/test.jpg")
        == "cineentry/users/user-1/uploads/test.jpg"
    )


def test_extract_file_key_from_signed_googleapis_url():
    service = _make_service()

    signed_url = (
        "https://storage.googleapis.com/cineentry-images/"
        "cineentry/users/user-1/uploads/test.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256"
    )

    assert service.extract_file_key(signed_url) == "cineentry/users/user-1/uploads/test.jpg"


def test_extract_file_key_from_download_api_url():
    service = _make_service()

    download_url = (
        "https://storage.googleapis.com/download/storage/v1/b/cineentry-images/o/"
        "cineentry%2Fusers%2Fuser-1%2Fuploads%2Ftest.jpg?alt=media"
    )

    assert service.extract_file_key(download_url) == "cineentry/users/user-1/uploads/test.jpg"


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
