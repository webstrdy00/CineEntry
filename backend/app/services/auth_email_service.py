"""
Authentication email templates and delivery
"""
from __future__ import annotations

from html import escape

from app.config import settings
from app.services.email_service import email_service


class AuthEmailService:
    def _verification_link(self, token: str) -> str:
        return f"{settings.BACKEND_PUBLIC_URL}/api/v1/auth/email/verify?token={token}"

    def _password_reset_link(self, token: str) -> str:
        return f"{settings.BACKEND_PUBLIC_URL}/api/v1/auth/password-reset?token={token}"

    def send_verification_email(self, to_email: str, display_name: str | None, token: str) -> None:
        safe_name = escape(display_name or "영화 애호가")
        link = self._verification_link(token)
        subject = "[CineEntry] 이메일 인증을 완료해주세요"
        text_body = (
            f"{safe_name}님,\n\n"
            f"아래 링크에서 이메일 인증을 완료해주세요.\n{link}\n\n"
            "링크가 만료되었으면 앱에서 인증 메일을 다시 요청해주세요."
        )
        html_body = f"""
        <html lang="ko">
          <body style="margin:0;padding:24px;background:#111827;color:#f9fafb;font-family:Arial,sans-serif;">
            <div style="max-width:560px;margin:0 auto;background:#1f2937;border-radius:20px;padding:32px;">
              <p style="color:#d4af37;font-size:13px;font-weight:bold;letter-spacing:0.08em;">CINEENTRY</p>
              <h1 style="margin:0 0 16px;font-size:28px;">이메일 인증</h1>
              <p style="margin:0 0 20px;line-height:1.7;">{safe_name}님, CineEntry 계정의 이메일 인증을 완료해주세요.</p>
              <a href="{link}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d4af37;color:#111827;text-decoration:none;font-weight:bold;">
                이메일 인증하기
              </a>
              <p style="margin:24px 0 0;line-height:1.7;color:#d1d5db;">버튼이 열리지 않으면 아래 링크를 복사해 사용해주세요.<br>{link}</p>
            </div>
          </body>
        </html>
        """
        email_service.send_email(to_email, subject, html_body, text_body)

    def send_password_reset_email(self, to_email: str, display_name: str | None, token: str, has_password: bool) -> None:
        safe_name = escape(display_name or "영화 애호가")
        link = self._password_reset_link(token)
        subject = "[CineEntry] 비밀번호 재설정 안내"
        action_text = "비밀번호를 재설정" if has_password else "이메일 로그인 비밀번호를 설정"
        text_body = (
            f"{safe_name}님,\n\n"
            f"아래 링크에서 {action_text}해주세요.\n{link}\n\n"
            "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다."
        )
        html_body = f"""
        <html lang="ko">
          <body style="margin:0;padding:24px;background:#111827;color:#f9fafb;font-family:Arial,sans-serif;">
            <div style="max-width:560px;margin:0 auto;background:#1f2937;border-radius:20px;padding:32px;">
              <p style="color:#d4af37;font-size:13px;font-weight:bold;letter-spacing:0.08em;">CINEENTRY</p>
              <h1 style="margin:0 0 16px;font-size:28px;">비밀번호 재설정</h1>
              <p style="margin:0 0 20px;line-height:1.7;">{safe_name}님, 아래 링크에서 {action_text}해주세요.</p>
              <a href="{link}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d4af37;color:#111827;text-decoration:none;font-weight:bold;">
                {action_text}
              </a>
              <p style="margin:24px 0 0;line-height:1.7;color:#d1d5db;">버튼이 열리지 않으면 아래 링크를 복사해 사용해주세요.<br>{link}</p>
            </div>
          </body>
        </html>
        """
        email_service.send_email(to_email, subject, html_body, text_body)


auth_email_service = AuthEmailService()
