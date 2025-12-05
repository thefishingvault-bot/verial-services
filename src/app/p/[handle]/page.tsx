import { db } from "@/lib/db";
import { providers, services, reviews, bookings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardFooter, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Star, Briefcase } from "lucide-react";
import { formatPrice, getTrustBadge } from "@/lib/utils";
import { ContactButton } from "@/components/common/contact-button";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { auth } from "@clerk/nextjs/server";

// This is a Server Component

// --- SEO Metadata Function ---
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;

  const provider = await db.query.providers.findFirst({
    where: eq(providers.handle, handle),
    columns: { businessName: true, bio: true },
  });

  if (!provider) {
    return { title: 'Profile Not Found' };
  }

  return {
    title: `${provider.businessName} | Verial`,
    description:
      provider.bio?.substring(0, 155) ||
      `Find ${provider.businessName} on Verial, New Zealand's trusted service marketplace.`,
  };
}

// --- Data Fetching Function ---
async function getProviderData(handle: string, currentUserId: string | null) {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.handle, handle),
    with: {
      user: {
        columns: {
          id: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
      services: {
        // Let the Drizzle relation filter by providerId
        orderBy: [desc(services.createdAt)],
      },
      reviews: {
        with: {
          user: {
            columns: { firstName: true, lastName: true },
          },
        },
        where: eq(reviews.isHidden, false),
        orderBy: [desc(reviews.createdAt)],
      },
      bookings: {
        columns: { id: true },
        where: eq(bookings.status, 'completed'),
      },
    },
  });

  if (!provider || provider.status !== "approved") {
    notFound();
  }

  let averageRating = 0;
  if (provider.reviews.length > 0) {
    const total = provider.reviews.reduce((acc, r) => acc + r.rating, 0);
    averageRating = total / provider.reviews.length;
  }

  let initialIsFavorite = false;
  if (currentUserId) {
    const fav = await db.query.favoriteProviders.findFirst({
      where: (fp, { and, eq }) =>
        and(eq(fp.userId, currentUserId), eq(fp.providerId, provider.id)),
      columns: { id: true },
    });
    initialIsFavorite = Boolean(fav);
  }

  return { provider, averageRating, bookingCount: provider.bookings.length, initialIsFavorite };
}

// --- Helper Components ---
type ProviderData = Awaited<ReturnType<typeof getProviderData>>;
type Provider = ProviderData['provider'];
type ProviderService = Provider['services'][number];
type ProviderReview = Provider['reviews'][number];

function ProviderHeader({
  provider,
  averageRating,
  bookingCount,
  initialIsFavorite,
  hasUser,
}: {
  provider: Provider;
  averageRating: number;
  bookingCount: number;
  initialIsFavorite: boolean;
  hasUser: boolean;
}) {
  const { Icon, color } = getTrustBadge(provider.trustLevel);
  const memberSinceYear = new Date(provider.user.createdAt).getFullYear();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col items-start gap-6 p-6 md:flex-row">
        <div className="relative h-32 w-32 flex-shrink-0">
          <Image
            src={provider.user.avatarUrl || '/default-avatar.png'}
            alt={provider.businessName}
            fill
            className="rounded-full border object-cover"
          />
        </div>
        <div className="flex-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">{provider.businessName}</h1>
              <Link
                href={`/p/${provider.handle}`}
                className="text-lg text-muted-foreground hover:underline"
              >
                @{provider.handle}
              </Link>
            </div>
        <div className="flex flex-col items-end gap-2">
          <ContactButton providerUserId={provider.user.id} />
          {hasUser && (
            <FavoriteButton
              providerId={provider.id}
              initialIsFavorite={initialIsFavorite}
            />
          )}
        </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            {provider.isVerified && (
              <Badge variant="secondary" className="w-fit">
                <CheckCircle className="mr-1 h-4 w-4 text-green-500" />
                Verified provider
              </Badge>
            )}
            <Badge variant="secondary" className={`flex w-fit items-center gap-1 ${color}`}>
              <Icon className="h-4 w-4" />
              {provider.trustLevel.charAt(0).toUpperCase() + provider.trustLevel.slice(1)} Trust
            </Badge>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Star className="h-4 w-4 text-yellow-400" />
              <span className="font-semibold">{averageRating.toFixed(1)}</span>
              <span>({provider.reviews.length} reviews)</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Briefcase className="h-4 w-4" />
              <span>{bookingCount} jobs completed</span>
            </div>
            <span className="text-muted-foreground">Member since {memberSinceYear}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <h2 className="mb-2 text-xl font-semibold">About {provider.businessName}</h2>
        <p className="whitespace-pre-wrap text-gray-700">
          {provider.bio || 'No bio provided.'}
        </p>
      </CardContent>
    </Card>
  );
}

function ServiceCard({ service }: { service: ProviderService }) {
  return (
    <Link href={`/s/${service.slug}`} key={service.id}>
      <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-lg">
        <CardHeader className="p-0">
          <div className="relative aspect-video w-full bg-gray-200">
            {service.coverImageUrl ? (
              <Image src={service.coverImageUrl} alt={service.title} fill className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-sm text-gray-500">No image</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-grow p-4">
          <Badge variant="outline" className="mb-2 capitalize">
            {service.category}
          </Badge>
          <h3 className="text-lg font-semibold">{service.title}</h3>
        </CardContent>
        <CardFooter className="p-4 pt-0">
          <p className="text-xl font-bold">{formatPrice(service.priceInCents)}</p>
        </CardFooter>
      </Card>
    </Link>
  );
}

function ReviewCard({ review }: { review: ProviderReview }) {
  const firstName = review.user.firstName ?? 'Customer';
  const lastInitial = review.user.lastName ? ` ${review.user.lastName.charAt(0)}.` : '';
  const reviewerName = `${firstName}${lastInitial}`;

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-semibold">{reviewerName}</span>
          <div className="flex items-center gap-1">
            <span className="font-bold">{review.rating}</span>
            <Star className="h-4 w-4 text-yellow-400" />
          </div>
        </div>
        <CardDescription>{new Date(review.createdAt).toLocaleDateString()}</CardDescription>
      </CardHeader>
      <CardContent>
        {review.comment && <p className="italic">&quot;{review.comment}&quot;</p>}
      </CardContent>
    </Card>
  );
}

// --- The Page Component ---
export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const { userId } = await auth();
  const { provider, averageRating, bookingCount, initialIsFavorite } = await getProviderData(
    handle,
    userId,
  );

  return (
    <div className="container mx-auto max-w-6xl space-y-12 p-4 md:p-8">
      <ProviderHeader
        provider={provider}
        averageRating={averageRating}
        bookingCount={bookingCount}
        initialIsFavorite={initialIsFavorite}
        hasUser={Boolean(userId)}
      />

      <section>
        <h2 className="mb-6 text-2xl font-bold">Services offered by {provider.businessName}</h2>
        {provider.services.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {provider.services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">This provider has not listed any services yet.</p>
        )}
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">What customers are saying</h2>
        {provider.reviews.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {provider.reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">This provider has no reviews yet.</p>
        )}
      </section>
    </div>
  );
}

