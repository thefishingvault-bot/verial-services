import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is not set');
}

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.EMAIL_FROM || 'Verial <no-reply@verial.co.nz>';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (payload: EmailPayload) => {
  try {
    const data = await resend.emails.send({
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

