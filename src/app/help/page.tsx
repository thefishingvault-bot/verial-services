import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CopyEmailButton } from '@/components/help/copy-email-button';

const FALLBACK_SUPPORT_EMAIL = 'support@verial.co.nz';

function getSupportEmail(): string {
  const raw = process.env.SUPPORT_EMAIL;
  if (raw && raw.trim()) return raw.trim();
  return FALLBACK_SUPPORT_EMAIL;
}

function mailto(email: string, subject: string) {
  const params = new URLSearchParams({ subject });
  return `mailto:${email}?${params.toString()}`;
}

const faqs: Array<{ q: string; a: string }> = [
  {
    q: 'How do bookings work?',
    a: 'Browse services, message providers if needed, then book and pay securely through Verial. Providers confirm availability and complete the job at the agreed time.',
  },
  {
    q: 'When am I charged?',
    a: 'You are charged when you complete checkout for a booking. If a booking is cancelled or refunded, the timing and amount may vary depending on the provider’s cancellation policy and platform review.',
  },
  {
    q: 'What are service / small order fees?',
    a: 'Some bookings include a customer service fee to help cover processing, support, and platform operations. The fee can vary based on the booking amount and will be shown clearly during checkout.',
  },
  {
    q: 'How do refunds/cancellations work?',
    a: 'Refunds and cancellations depend on the booking status and the provider’s policy. If you have a problem, contact support with your booking ID and we’ll help review it.',
  },
  {
    q: 'Provider payouts: when do I get paid?',
    a: 'Providers receive payouts based on the booking’s completion status and payment settlement. If you’re a provider and have payout questions, contact support with your booking ID and Stripe account email.',
  },
  {
    q: 'How do I contact support?',
    a: 'Email us using the address below. Include as much detail as possible (screenshots, booking ID, and what you expected to happen).',
  },
];

export default function HelpPage() {
  const supportEmail = getSupportEmail();

  const quickActions = [
    {
      title: 'Report a problem',
      description: 'Something isn’t working? Tell us what happened and we’ll investigate.',
      href: mailto(supportEmail, 'Verial: Report a problem'),
    },
    {
      title: 'Payment issue',
      description: 'Charges, receipts, failed payments, or checkout issues.',
      href: mailto(supportEmail, 'Verial: Payment issue'),
    },
    {
      title: 'Booking dispute',
      description: 'Need help resolving a booking issue with a provider or customer.',
      href: mailto(supportEmail, 'Verial: Booking dispute'),
    },
    {
      title: 'Provider support',
      description: 'Help with listings, images, payouts, or account setup.',
      href: mailto(supportEmail, 'Verial: Provider support'),
    },
  ];

  return (
    <main className="container max-w-4xl py-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Help &amp; Support</h1>
        <p className="text-muted-foreground">
          Get help with bookings, payments, disputes, and provider setup. If you’re stuck, reach out and we’ll respond as soon as we can.
        </p>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Quick actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {quickActions.map((action) => (
            <Card key={action.title} className="hover:shadow-sm transition-shadow">
              <CardHeader>
                <CardTitle className="text-base">{action.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{action.description}</p>
                <Button asChild className="w-full sm:w-auto">
                  <Link href={action.href}>Email support</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">FAQ</h2>
        <div className="mt-4 space-y-3">
          {faqs.map((item) => (
            <details
              key={item.q}
              className="group rounded-lg border bg-card px-4 py-3"
            >
              <summary className="cursor-pointer select-none list-none font-medium outline-none">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
                {item.q}
              </summary>
              <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Contact</h2>
        <div className="mt-4 rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Email us at{' '}
            <a className="font-medium text-foreground underline underline-offset-4" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="sm:w-auto">
              <a href={`mailto:${supportEmail}`}>Open email</a>
            </Button>
            <CopyEmailButton email={supportEmail} />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Tip: include your booking ID (if applicable), what device/browser you’re using, and any screenshots.
          </p>
        </div>
      </section>
    </main>
  );
}
