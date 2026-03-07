"""
Email delivery service
SMTP 또는 콘솔 로그 기반 메일 발송
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def _build_sender(self) -> str:
        if settings.EMAIL_FROM_NAME:
            return f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>"
        return settings.EMAIL_FROM_ADDRESS

    def _build_log_only_output(self, to_email: str, subject: str, preview_body: str) -> str:
        return (
            "\n"
            "========== EMAIL_LOG_ONLY ==========\n"
            f"to: {to_email}\n"
            f"subject: {subject}\n"
            f"log_only: {settings.EMAIL_LOG_ONLY}\n"
            "body:\n"
            f"{preview_body}\n"
            "======== END EMAIL_LOG_ONLY ========\n"
        )

    def send_email(self, to_email: str, subject: str, html_body: str, text_body: str | None = None) -> None:
        if settings.EMAIL_LOG_ONLY or not settings.SMTP_HOST:
            preview_body = text_body or html_body
            log_output = self._build_log_only_output(to_email, subject, preview_body)
            print(log_output, flush=True)
            logger.info(log_output)
            return

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self._build_sender()
        message["To"] = to_email
        message.set_content(text_body or "CineEntry 메일입니다.")
        message.add_alternative(html_body, subtype="html")

        context = ssl.create_default_context()

        if settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context) as smtp:
                self._login_and_send(smtp, message)
            return

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls(context=context)
            self._login_and_send(smtp, message)

    def _login_and_send(self, smtp: smtplib.SMTP, message: EmailMessage) -> None:
        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(message)


email_service = EmailService()
