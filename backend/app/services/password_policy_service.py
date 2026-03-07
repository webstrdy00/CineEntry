"""
Password policy service
공통 비밀번호 정책 평가
"""
from __future__ import annotations

import re

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 100

PASSWORD_POLICY_REQUIREMENTS = (
    f"최소 {PASSWORD_MIN_LENGTH}자 이상",
    "이메일이나 닉네임이 포함되면 안 됩니다.",
    "12345, qwerty, aaaaaa 같은 쉬운 패턴은 사용할 수 없습니다.",
)

_COMMON_PASSWORDS = {
    "123456",
    "1234567",
    "12345678",
    "123456789",
    "1234567890",
    "12345678910",
    "abc123",
    "admin",
    "admin123",
    "asdf1234",
    "dragon",
    "football",
    "iloveyou",
    "letmein",
    "login",
    "master",
    "monkey",
    "passw0rd",
    "password",
    "password1",
    "password12",
    "password123",
    "qwer1234",
    "qwerty",
    "qwerty123",
    "qwerty12345",
    "user1234",
    "welcome",
    "welcome123",
}

_SEQUENCE_SOURCES = (
    "0123456789",
    "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
)


def _normalize(value: str) -> str:
    return "".join(ch for ch in value.casefold() if ch.isalnum())


def _is_meaningful_fragment(value: str) -> bool:
    if len(value) >= 3:
        return True
    return len(value) >= 2 and any(ord(ch) > 127 for ch in value)


def _collect_personal_fragments(email: str | None, display_name: str | None) -> set[str]:
    fragments: set[str] = set()

    if email:
        local_part = email.split("@", 1)[0]
        local_normalized = _normalize(local_part)
        if _is_meaningful_fragment(local_normalized):
            fragments.add(local_normalized)
        for token in re.split(r"[^0-9A-Za-z가-힣]+", local_part.casefold()):
            token_normalized = _normalize(token)
            if _is_meaningful_fragment(token_normalized):
                fragments.add(token_normalized)

    if display_name:
        display_normalized = _normalize(display_name)
        if _is_meaningful_fragment(display_normalized):
            fragments.add(display_normalized)
        for token in re.split(r"[^0-9A-Za-z가-힣]+", display_name.casefold()):
            token_normalized = _normalize(token)
            if _is_meaningful_fragment(token_normalized):
                fragments.add(token_normalized)

    return fragments


def _is_repeated_character(password_normalized: str) -> bool:
    return len(password_normalized) >= 4 and len(set(password_normalized)) == 1


def _is_repeated_chunk(password_normalized: str) -> bool:
    if len(password_normalized) < 6:
        return False

    for size in range(1, len(password_normalized) // 2 + 1):
        if len(password_normalized) % size != 0:
            continue
        chunk = password_normalized[:size]
        if chunk * (len(password_normalized) // size) == password_normalized:
            return True

    return False


def _has_sequence(password_normalized: str, min_run: int = 5) -> bool:
    if len(password_normalized) < min_run:
        return False

    for start in range(len(password_normalized) - min_run + 1):
        chunk = password_normalized[start : start + min_run]
        for source in _SEQUENCE_SOURCES:
            if chunk in source or chunk in source[::-1]:
                return True

    return False


def evaluate_password_policy(
    password: str,
    *,
    email: str | None = None,
    display_name: str | None = None,
) -> dict[str, bool]:
    normalized_password = _normalize(password)
    personal_fragments = _collect_personal_fragments(email, display_name)

    contains_personal_info = bool(
        normalized_password
        and any(fragment in normalized_password for fragment in personal_fragments)
    )
    uses_common_pattern = bool(
        normalized_password
        and (
            normalized_password in _COMMON_PASSWORDS
            or _is_repeated_character(normalized_password)
            or _is_repeated_chunk(normalized_password)
            or _has_sequence(normalized_password)
        )
    )

    return {
        "meets_length": len(password) >= PASSWORD_MIN_LENGTH,
        "avoids_personal_info": bool(password) and not contains_personal_info,
        "avoids_common_pattern": bool(password) and not uses_common_pattern,
    }


def validate_password_policy(
    password: str,
    *,
    email: str | None = None,
    display_name: str | None = None,
) -> list[str]:
    evaluation = evaluate_password_policy(
        password,
        email=email,
        display_name=display_name,
    )
    errors: list[str] = []

    if not evaluation["meets_length"]:
        errors.append(f"비밀번호는 최소 {PASSWORD_MIN_LENGTH}자 이상이어야 합니다.")
    if not evaluation["avoids_personal_info"]:
        errors.append("이메일이나 닉네임이 포함된 비밀번호는 사용할 수 없습니다.")
    if not evaluation["avoids_common_pattern"]:
        errors.append("12345, qwerty, 반복 문자 같은 쉬운 비밀번호는 사용할 수 없습니다.")

    return errors
