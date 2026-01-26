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

function maskEmail(value: string) {
  const email = value.trim();
  const at = email.indexOf('@');
  if (at <= 0) return '<invalid>';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  const localMasked = local.length <= 2
    ? `${local[0] ?? '*'}*`
    : `${local[0]}***${local.slice(-1)}`;

  const domainParts = domain.split('.');
  const domainFirst = domainParts[0] ?? domain;
  const domainMasked = domainFirst.length <= 2
    ? `${domainFirst[0] ?? '*'}*`
    : `${domainFirst[0]}***${domainFirst.slice(-1)}`;
  const tld = domainParts.length > 1 ? `.${domainParts.slice(1).join('.')}` : '';

  return `${localMasked}@${domainMasked}${tld}`;
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (payload: EmailPayload) => {
  try {
    const client = getResendClient();

    if (!process.env.EMAIL_FROM) {
      console.warn('[EMAIL] EMAIL_FROM not set - using default sender. Ensure this sender/domain is verified in Resend.');
    }

    console.info('[EMAIL] send_attempt', {
      from: fromEmail,
      to: maskEmail(payload.to),
      subject: payload.subject,
      hasResendKey: Boolean(process.env.RESEND_API_KEY),
    });

    if (!client) {
      console.warn('[EMAIL_SKIPPED] RESEND_API_KEY not configured.', {
        from: fromEmail,
        to: maskEmail(payload.to),
        subject: payload.subject,
      });
      return null;
    }

    const data = await client.emails.send({
      from: fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });

    console.info('[EMAIL_SENT]', {
      subject: payload.subject,
      to: maskEmail(payload.to),
      id: (data as { id?: string } | null | undefined)?.id ?? null,
    });
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[EMAIL_ERROR] Failed to send email', {
      from: fromEmail,
      to: maskEmail(payload.to),
      subject: payload.subject,
      message,
    });
    // Don't throw, just log the error. A failed email
    // should not fail the entire API request.
  }
};

