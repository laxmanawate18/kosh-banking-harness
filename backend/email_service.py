"""
Transactional email service for Kosh Digital Banking.

Supports standard SMTP delivery (TLS/SSL) with automatic fallback to
audit-logged simulated delivery when SMTP configuration is absent.
"""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
import os
import smtplib
from typing import Any, Dict, Optional

logger = logging.getLogger("sentinel.email")


class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "").strip()
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "").strip()
        self.smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
        self.smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
        self.from_email = os.getenv("SMTP_FROM_EMAIL", "no-reply@kosh.bank").strip()
        self.from_name = os.getenv("SMTP_FROM_NAME", "Kosh Security & Operations").strip()
        self.public_url = os.getenv("SENTINEL_PUBLIC_URL", "https://sentinel-banking-275388304596.us-central1.run.app").strip().rstrip("/")

    @property
    def is_configured(self) -> bool:
        return bool(self.smtp_host)

    def send_credentials_email(
        self,
        to_email: str,
        applicant_name: str,
        username: str,
        temp_password: str,
        customer_id: str,
        product_title: str,
        account_number: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Deliver approved customer credentials via email.
        """
        to_email = (to_email or "").strip()
        if not to_email or "@" not in to_email:
            return {
                "success": False,
                "delivery_status": "FAILED",
                "error": f"Invalid recipient email address: '{to_email}'",
                "to": to_email,
            }

        subject = f"Your Kosh Digital Banking Credentials - {product_title} Approved"
        login_url = f"{self.public_url}/"

        text_content = f"""Dear {applicant_name},

Congratulations! Your application for {product_title} has been reviewed and approved by Kosh Banking Operations.

Your digital banking credentials have been provisioned:
- Customer ID: {customer_id}
- Username: {username}
- Temporary Password: {temp_password}
{f'- Account Number: {account_number}' if account_number else ''}

To access your account:
1. Visit: {login_url}
2. Sign in using your username and temporary password.
3. For your security, you will be prompted to establish a permanent password and confirm your identity upon initial login.

Security Notice:
Kosh will never ask for your password or OTP over the phone or email. Never share these credentials with anyone.

Sincerely,
Kosh Digital Banking Operations
"""

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0c; margin: 0; padding: 24px; color: #202126; }}
    .container {{ max-width: 560px; margin: 0 auto; background: #f4f5f7; border: 1px solid #34363d; border-radius: 20px; overflow: hidden; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35); }}
    .header {{ background: #17181c; color: #f2f2f0; padding: 30px 32px; border-top: 2px solid #d9b36a; }}
    .brand {{ font-size: 14px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #d9b36a; margin-bottom: 7px; }}
    .title {{ font-size: 22px; font-weight: 700; margin: 0; }}
    .content {{ padding: 32px; line-height: 1.6; font-size: 14px; }}
    .badge {{ display: inline-block; background: #efe4ce; color: #5c451d; padding: 5px 11px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 16px; }}
    .cred-box {{ background: #e8e9ec; border: 1px solid #c9cbd1; border-radius: 14px; padding: 20px; margin: 24px 0; }}
    .cred-row {{ display: flex; justify-content: space-between; gap: 20px; padding: 9px 0; border-bottom: 1px dashed #c4c6cc; }}
    .cred-row:last-child {{ border-bottom: none; }}
    .cred-label {{ color: #656870; font-size: 12px; text-transform: uppercase; font-family: monospace; }}
    .cred-value {{ font-family: monospace; font-weight: 800; color: #17181c; font-size: 14px; text-align: right; }}
    .button {{ display: block; text-align: center; background: #17181c; color: #ffffff !important; padding: 14px 24px; border-radius: 999px; text-decoration: none; font-weight: 800; margin: 28px 0 16px; font-size: 14px; border: 1px solid #d9b36a; }}
    .notice {{ background: #f5ead6; border: 1px solid #d9b36a; border-radius: 10px; padding: 13px; font-size: 12px; color: #584019; margin-top: 20px; }}
    .footer {{ padding: 20px 32px; background: #e8e9ec; border-top: 1px solid #d2d3d7; font-size: 11px; color: #6d7078; text-align: center; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Kosh Digital Banking</div>
      <h1 class="title">Application Approved</h1>
    </div>
    <div class="content">
      <span class="badge">Approved & Provisioned</span>
      <p>Dear <strong>{applicant_name}</strong>,</p>
      <p>We are pleased to inform you that your application for the <strong>{product_title}</strong> has been approved by Kosh Banking Operations.</p>
      
      <p>Your secure digital banking access has been provisioned. Please use the credentials below to sign in:</p>
      
      <div class="cred-box">
        <div class="cred-row">
          <span class="cred-label">Customer ID</span>
          <span class="cred-value">{customer_id}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Username</span>
          <span class="cred-value">{username}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Temporary Password</span>
          <span class="cred-value">{temp_password}</span>
        </div>
        {f'<div class="cred-row"><span class="cred-label">Account Number</span><span class="cred-value">{account_number}</span></div>' if account_number else ''}
      </div>

      <a href="{login_url}" class="button">Access Kosh Banking</a>

      <div class="notice">
        <strong>Security Notice:</strong> You will be prompted to change your temporary password and verify your registered mobile number upon first sign-in. Never share these credentials with anyone.
      </div>
    </div>
    <div class="footer">
      Kosh Digital Banking · Operations & Underwriting Division<br>
      Automated system notification · Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>"""

        if not self.is_configured:
            logger.info(
                f"[EmailService SIMULATED] Would send credentials email to '{to_email}' "
                f"for user '{username}' (Customer: {customer_id}, Product: {product_title}). "
                f"SMTP not configured (set SMTP_HOST to enable live email delivery)."
            )
            return {
                "success": True,
                "delivery_status": "SIMULATED_LOGGED",
                "method": "SIMULATED",
                "to": to_email,
                "subject": subject,
                "preview": {
                    "username": username,
                    "customer_id": customer_id,
                    "product": product_title,
                },
            }

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to_email

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            msg.attach(part1)
            msg.attach(part2)

            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=12) as server:
                if self.smtp_use_tls:
                    server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)

            logger.info(f"[EmailService SENT] Successfully dispatched credentials to {to_email} via {self.smtp_host}")
            return {
                "success": True,
                "delivery_status": "SENT",
                "method": "SMTP",
                "to": to_email,
                "subject": subject,
            }
        except Exception as e:
            logger.error(f"[EmailService ERROR] Failed to dispatch email to {to_email}: {e}", exc_info=True)
            return {
                "success": False,
                "delivery_status": "FAILED",
                "method": "SMTP",
                "to": to_email,
                "error": str(e),
            }


# Global singleton instance
email_service = EmailService()
