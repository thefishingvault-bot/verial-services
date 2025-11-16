import { db } from '@/lib/db';
import { providers, services, reviews } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Star } from 'lucide-react';
import { formatPrice, getTrustBadge } from '@/lib/utils';

// This is a Server Component

async function getProviderData(handle: string) {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.handle, handle),
    with: {
      user: {
        columns: {
          avatarUrl: true,
          createdAt: true,
        },
      },
      services: {
        where: eq(services.providerId, providers.id),
        orderBy: [desc(services.createdAt)],
      },
      reviews: {
        with: {
          user: {
            columns: { firstName: true, lastName: true },
          },
        },
        orderBy: [desc(reviews.createdAt)],
      },
    },
  });

  if (!provider || provider.status !== 'approved') {
    notFound();
  }

  const safeProvider = provider as NonNullable<typeof provider>;

  const averageRating =
    safeProvider.reviews.length > 0
      ? safeProvider.reviews.reduce((acc, r) => acc + r.rating, 0) / safeProvider.reviews.length
      : 0;

  return { provider: safeProvider, averageRating };
}

type ProviderData = Awaited<ReturnType<typeof getProviderData>>;
type ProviderWithRelations = ProviderData['provider'];

type Service = ProviderWithRelations['services'][number];
type Review = ProviderWithRelations['reviews'][number];

function ProviderHeader({
  provider,
  averageRating,
}: {
  provider: ProviderWithRelations;
  averageRating: number;
}) {
  const { Icon, color } = getTrustBadge(provider.trustLevel);
  const memberSinceYear = new Date(provider.user.createdAt).getFullYear();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col items-start gap-6 p-6 md:flex-row">
        <Image
          src={provider.user.avatarUrl || '/default-avatar.png'}
          alt={provider.businessName}
          width={128}
          height={128}
          className="aspect-square rounded-full border object-cover"
        />
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{provider.businessName}</h1>
          <p className="text-lg text-muted-foreground">@{provider.handle}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {provider.isVerified && (
              <Badge variant="secondary" className="w-fit">
                <CheckCircle className="mr-1 h-4 w-4 text-green-500" />
                Verified provider
              </Badge>
            )}
            <Badge variant="secondary" className={`flex w-fit items-center gap-1 ${color}`}>
              <Icon className="h-4 w-4" />
              <span>
                {provider.trustLevel.charAt(0).toUpperCase() + provider.trustLevel.slice(1)} trust
              </span>
            </Badge>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{averageRating.toFixed(1)}</span>
              <span>({provider.reviews.length} reviews)</span>
            </div>
            <span className="text-muted-foreground">Member since {memberSinceYear}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <h2 className="mb-2 text-xl font-semibold">About {provider.businessName}</h2>
        <p className="whitespace-pre-wrap text-gray-700">
          {provider.bio || 'No bio provided yet.'}
        </p>
      </CardContent>
    </Card>
  );
}

function ServiceCard({ service }: { service: Service }) {
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

function ReviewCard({ review }: { review: Review }) {
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
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
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

export default async function ProviderProfilePage({
  params,
}: {
  params: { handle: string };
}) {
  const { provider, averageRating } = await getProviderData(params.handle);

  return (
    <div className="container mx-auto max-w-6xl space-y-12 p-4 md:p-8">
      <ProviderHeader provider={provider} averageRating={averageRating} />

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

