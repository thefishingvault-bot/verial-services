import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { db } from '../../../../../lib/db';
import { services, reviews, bookings } from '../../../../../db/schema';
import { and, eq, or, sql } from 'drizzle-orm';

export const runtime = 'edge';
export const revalidate = 3600;

function sanitize(text: string | null | undefined, max = 60) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').slice(0, max);
}

type RouteContext = { params: Promise<{ slug: string | string[] | undefined }> };

const handler = async (req: NextRequest, context: RouteContext): Promise<Response> => {
  const { slug } = await context.params;
  if (!slug) {
    return new Response('Missing slug', { status: 400 });
  }

  const service = await db.query.services.findFirst({
    where: eq(services.slug, slug),
    with: {
      provider: {
        columns: {
          businessName: true,
          isVerified: true,
        },
      },
    },
  });

  if (!service) {
    return new Response('Not found', { status: 404 });
  }

  const baseWhere = and(
    eq(reviews.isHidden, false),
    or(eq(reviews.serviceId, service.id), eq(bookings.serviceId, service.id)),
  );

  const [{ avgRating, totalReviews }] = await db
    .select({
      avgRating: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      totalReviews: sql<number>`COUNT(${reviews.id})`,
    })
    .from(reviews)
    .leftJoin(bookings, eq(bookings.id, reviews.bookingId))
    .where(baseWhere);

  const title = sanitize(service.title, 90);
  const providerName = sanitize(service.provider?.businessName ?? 'Provider', 50);
  const price = `NZ$ ${(service.priceInCents / 100).toFixed(2)}`;
  const ratingText = `${avgRating?.toFixed(1) ?? 'N/A'} ★ (${totalReviews ?? 0})`;
  const verified = service.provider?.isVerified;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          color: 'white',
          padding: '48px',
          fontFamily: 'Inter',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '28px', color: '#a5f3fc', letterSpacing: '1px' }}>Verial Services</div>
            <div style={{ fontSize: '54px', fontWeight: 800, maxWidth: '900px', lineHeight: 1.1 }}>
              {title || 'Service' }
            </div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '10px', fontSize: '24px', color: '#cbd5e1' }}>
              <span>{price}</span>
              <span style={{ color: '#fbbf24' }}>{ratingText}</span>
              {verified ? (
                <span style={{
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.4)',
                  color: '#34d399',
                  fontSize: '18px',
                }}>Verified</span>
              ) : null}
            </div>
            <div style={{ fontSize: '22px', color: '#e2e8f0' }}>By {providerName}</div>
          </div>
          <div
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #10b981, #0ea5e9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '80px',
              fontWeight: 800,
              color: '#0f172a',
            }}
          >
            {title ? title.charAt(0).toUpperCase() : 'S'}
          </div>
        </div>
        <div style={{ marginTop: '32px', display: 'flex', gap: '16px', color: '#cbd5e1', fontSize: '18px' }}>
          <div style={{ padding: '10px 16px', borderRadius: '12px', background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.3)' }}>
            Trusted providers. Transparent pricing. NZ-wide.
          </div>
          <div style={{ padding: '10px 16px', borderRadius: '12px', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }}>
            Book securely with Verial
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // Use default fonts; no custom font file bundled in production build.
    },
  );
};

export const GET = handler as any;
