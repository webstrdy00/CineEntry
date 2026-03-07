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

    def _build_email_html(
        self,
        *,
        preheader: str,
        title: str,
        body_html: str,
        button_label: str,
        button_link: str,
        notice_title: str,
        notice_body: str,
    ) -> str:
        return f"""
        <html lang="ko">
          <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="color-scheme" content="light only">
            <meta name="supported-color-schemes" content="light">
            <title>{title}</title>
          </head>
          <body style="margin:0;padding:0;background-color:#f6f1e8;">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
              {preheader}
            </div>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#f6f1e8;margin:0;padding:0;">
              <tr>
                <td align="center" style="padding:24px 12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:560px;border-collapse:collapse;">
                    <tr>
                      <td style="padding:0;">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#171c27;border-radius:28px 28px 0 0;">
                          <tr>
                            <td style="padding:28px 32px 24px;">
                              <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.2;letter-spacing:0.18em;color:#d4af37;font-weight:700;">
                                CINEENTRY
                              </div>
                              <div style="padding-top:14px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#d8dce5;">
                                영화 기록을 더 또렷하게 이어가는 계정 안내입니다.
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0;">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#ffffff;border:1px solid #e3d7c3;border-top:none;border-radius:0 0 28px 28px;">
                          <tr>
                            <td style="padding:34px 32px 18px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#171717;">
                              <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;color:#171717;font-weight:700;">
                                {title}
                              </div>
                              <div style="padding-top:16px;font-size:16px;line-height:1.75;color:#3f3b36;">
                                {body_html}
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td align="left" style="padding:0 32px 28px;">
                              <a href="{button_link}" style="display:inline-block;padding:15px 24px;border-radius:999px;background-color:#d4af37;color:#171c27;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">
                                {button_label}
                              </a>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:0 32px 18px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#f8f3e8;border:1px solid #eadab4;border-radius:18px;">
                                <tr>
                                  <td style="padding:16px 18px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
                                    <div style="font-size:13px;line-height:1.4;font-weight:700;color:#6d5620;">
                                      {notice_title}
                                    </div>
                                    <div style="padding-top:6px;font-size:14px;line-height:1.65;color:#5a5144;">
                                      {notice_body}
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:0 32px 32px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#7a6f60;">
                              CineEntry 팀 드림
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
        """

    def send_verification_email(self, to_email: str, display_name: str | None, token: str) -> None:
        safe_name = escape(display_name or "영화 애호가")
        link = self._verification_link(token)
        subject = "[CineEntry] 이메일 인증을 완료해주세요"
        text_body = (
            f"{safe_name}님,\n\n"
            f"아래 링크에서 이메일 인증을 완료해주세요.\n{link}\n\n"
            "링크가 만료되었으면 앱에서 인증 메일을 다시 요청해주세요."
        )
        html_body = self._build_email_html(
            preheader="CineEntry 계정 이메일 인증을 완료해주세요.",
            title="이메일 인증",
            body_html=(
                f"{safe_name}님, CineEntry 계정의 이메일 인증을 완료해주세요.<br>"
                "인증이 끝나면 이메일 로그인과 계정 복구 기능을 안정적으로 사용할 수 있습니다."
            ),
            button_label="이메일 인증하기",
            button_link=link,
            notice_title="안내",
            notice_body=f"인증 링크는 발송 시점부터 {settings.EMAIL_VERIFICATION_TOKEN_TTL_HOURS}시간 동안 유효합니다. 만료되면 앱에서 다시 요청할 수 있습니다.",
        )
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
        html_body = self._build_email_html(
            preheader=f"CineEntry 계정 {action_text} 안내입니다.",
            title="비밀번호 재설정",
            body_html=(
                f"{safe_name}님, 아래 버튼에서 {action_text}해주세요.<br>"
                "본인이 요청하지 않았다면 별도 조치 없이 이 메일을 무시하셔도 됩니다."
            ),
            button_label=action_text,
            button_link=link,
            notice_title="보안 안내",
            notice_body=f"재설정 링크는 발송 시점부터 {settings.PASSWORD_RESET_TOKEN_TTL_MINUTES}분 동안만 유효합니다. 시간이 지나면 앱에서 다시 요청해주세요.",
        )
        email_service.send_email(to_email, subject, html_body, text_body)


auth_email_service = AuthEmailService()
