import { Resend } from 'resend';

// Lazy initialization - only create Resend client when actually sending emails
let resend: Resend | null = null;

const getResendClient = () => {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[EMAIL] RESEND_API_KEY not set - emails will not be sent');
      return null;
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

const fromEmail = process.env.EMAIL_FROM || 'Verial <no-reply@verial.co.nz>';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (payload: EmailPayload) => {
  try {
    const client = getResendClient();

    if (!client) {
      console.warn(`[EMAIL_SKIPPED] RESEND_API_KEY not configured. Would have sent: ${payload.subject} to ${payload.to}`);
      return null;
    }

    const data = await client.emails.send({
      from: fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });

    console.log(`[EMAIL_SENT] Subject: ${payload.subject}, To: ${payload.to}`);
    return data;
  } catch (error) {
    console.error(`[EMAIL_ERROR] Failed to send email:`, error);
    // Don't throw, just log the error. A failed email
    // should not fail the entire API request.
  }
};

