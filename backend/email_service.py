"""Transactional email for Kosh Digital Banking: approved-applicant credentials.

Sends over SMTP (STARTTLS) when SMTP_HOST is set; otherwise the send is logged as simulated.
"""

import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger("kosh.email")


def send_credentials_email(to_email: str, applicant_name: str, username: str, temp_password: str, customer_id: str,
                           product_title: str, account_number: Optional[str] = None) -> str:
    """Email approved credentials. Returns the delivery status: SENT, SIMULATED_LOGGED or FAILED."""
    to_email = (to_email or "").strip()
    if "@" not in to_email:
        logger.warning("Credentials email not sent: invalid recipient %r", to_email)
        return "FAILED"
    public_url = os.getenv("SENTINEL_PUBLIC_URL", "https://sentinel-banking-275388304596.us-central1.run.app").strip().rstrip("/")
    subject = f"Your Kosh Digital Banking Credentials - {product_title} Approved"
    login_url = f"{public_url}/"

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

    smtp_host = os.getenv("SMTP_HOST", "").strip()
    if not smtp_host:
        logger.info("[email SIMULATED] credentials for %s (customer %s) to %s; set SMTP_HOST to send", username, customer_id, to_email)
        return "SIMULATED_LOGGED"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{os.getenv('SMTP_FROM_NAME', 'Kosh Security & Operations').strip()} <{os.getenv('SMTP_FROM_EMAIL', 'no-reply@kosh.bank').strip()}>"
    msg["To"] = to_email
    msg.set_content(text_content)
    msg.add_alternative(html_content, subtype="html")
    try:
        with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", "587")), timeout=12) as server:
            if os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes"):
                server.starttls()
            user, password = os.getenv("SMTP_USER", "").strip(), os.getenv("SMTP_PASSWORD", "").strip()
            if user and password:
                server.login(user, password)
            server.send_message(msg)
    except Exception as exc:
        logger.error("Credentials email to %s failed: %s", to_email, exc, exc_info=True)
        return "FAILED"
    logger.info("Credentials email sent to %s via %s", to_email, smtp_host)
    return "SENT"
