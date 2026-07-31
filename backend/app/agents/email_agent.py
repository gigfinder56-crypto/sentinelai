import os
import smtplib
import time
import uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", SMTP_USER or "sentinel.ai.emergency@gmail.com")


class EmailAgent:
    """
    Autonomous Emergency Email Dispatch Agent.
    Sends formatted emergency dispatch alerts to department email addresses
    (e.g., police@gov.in, hospital@emergency.org, fire@rescue.gov.in).
    """
    def __init__(self):
        self.smtp_user = SMTP_USER
        self.smtp_pass = SMTP_PASS
        self.configured = bool(self.smtp_user and self.smtp_pass)

    def send_emergency_email(
        self,
        to_email: str,
        recipient_name: str,
        subject: str,
        body_text: str,
        incident_id: str = "MANUAL",
        severity: str = "HIGH",
    ) -> dict:
        msg_id = f"EML-{uuid.uuid4().hex[:8].upper()}"
        now = time.time()
        time_str = time.strftime("%H:%M:%S", time.localtime(now))
        
        mode = "simulated"
        status = "delivered"
        error_msg = None

        if self.configured:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = f"🚨 [SENTINEL AI - {severity.upper()}] {subject}"
                msg["From"] = f"Sentinel AI Autonomous Officer <{SENDER_EMAIL}>"
                msg["To"] = to_email

                html_body = f"""
                <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; border-radius: 12px;">
                    <div style="border-bottom: 2px solid #ef4444; padding-bottom: 10px; margin-bottom: 15px;">
                        <h2 style="color: #ef4444; margin: 0;">🚨 SENTINEL AI - AUTONOMOUS EMERGENCY DISPATCH</h2>
                        <p style="color: #94a3b8; font-size: 13px; margin: 5px 0 0 0;">Incident Reference: <strong>{incident_id}</strong> | Timestamp: {time_str}</p>
                    </div>
                    
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; border-left: 4px solid #38bdf8; margin-bottom: 15px;">
                        <h3 style="color: #38bdf8; margin-top: 0;">Attention: {recipient_name}</h3>
                        <p style="font-size: 15px; line-height: 1.5; color: #e2e8f0;">{body_text}</p>
                    </div>

                    <div style="font-size: 12px; color: #64748b; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                        🤖 This alert was autonomously generated and dispatched by Sentinel AI Multi-Agent Public Safety Ecosystem.
                    </div>
                </div>
                """

                msg.attach(MIMEText(body_text, "plain"))
                msg.attach(MIMEText(html_body, "html"))

                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
                    server.starttls()
                    server.login(self.smtp_user, self.smtp_pass)
                    server.sendmail(SENDER_EMAIL, [to_email], msg.as_string())
                
                mode = "smtp"
                status = "sent"
                print(f"[EmailAgent] Sent real email alert to {to_email}")
            except Exception as err:
                mode = "smtp_fallback"
                status = "simulated"
                error_msg = str(err)
                print(f"[EmailAgent] SMTP dispatch failed ({err}). Falling back to simulated email dispatch log.")

        entry = {
            "id": msg_id,
            "incident_id": incident_id,
            "timestamp": now,
            "formatted_time": time_str,
            "recipient_type": "email_alert",
            "channel": "email",
            "name": recipient_name,
            "email": to_email,
            "phone": None,
            "subject": subject,
            "message_body": body_text,
            "sms_status": status,
            "call_status": "n/a",
            "mode": mode,
            "error": error_msg,
        }
        return entry
