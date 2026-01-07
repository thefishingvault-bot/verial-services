import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { CheckCircle } from "lucide-react";

import { ContactButton } from "@/components/common/contact-button";
import { ServiceFavoriteButton } from "@/components/favorites/service-favorite-button";
import { ProviderStatsCard } from "@/components/services/detail/provider-stats-card";
import { ReviewList, type ReviewItem } from "@/components/services/detail/review-list";
import { ReviewSummary, type ReviewBreakdown } from "@/components/services/detail/review-summary";
import { ServiceBookingPanel } from "@/components/services/detail/service-booking-panel";
import { SimilarServicesGrid } from "@/components/services/detail/similar-services-grid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { db } from "@/lib/db";
import { getProviderStats } from "@/lib/provider-stats";
import { getSimilarServices, type SimilarService } from "@/lib/similar-services";
import { getTrustBadge } from "@/lib/utils";
import { getTrustTier } from "@/lib/trust";
import { providerNotCurrentlySuspendedWhere } from "@/lib/suspension";
import {
  providers,
  providerTimeOffs,
  reviews,
  serviceFavorites,
  services,
  users,
} from "@/db/schema";

type ServiceDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  pricingType: (typeof services.pricingType.enumValues)[number];
  priceInCents: number | null;
  priceNote: string | null;
  category: (typeof services.category.enumValues)[number];
  coverImageUrl: string | null;
  chargesGst: boolean;
  createdAt: Date;
  region: string | null;
  suburb: string | null;
  provider: {
    id: string;
    userId: string | null;
    handle: string | null;
    businessName: string | null;
    bio: string | null;
    trustLevel: (typeof providers.trustLevel.enumValues)[number];
    trustScore: number;
    isVerified: boolean;
  };
  avgRating: number;
  reviewCount: number;
  favoriteCount: number;
  isFavorited: boolean;
};

type ServiceDetailData = {
  service: ServiceDetail;
  reviewSummary: {
    average: number;
    total: number;
    breakdown: ReviewBreakdown;
  };
  reviewItems: ReviewItem[];
  blockedDays: { from: Date; to: Date }[];
  similarServices: SimilarService[];
  providerStats: Awaited<ReturnType<typeof getProviderStats>>;
};

type ServiceParams = {
  params: Promise<{ slug: string }>;
};

async function getReviewData(serviceId: string) {
  const [summary] = await db
    .select({
      average: sql<number>`COALESCE(AVG(${reviews.rating}) FILTER (WHERE ${reviews.isHidden} = false), 0)`,
      total: sql<number>`COUNT(${reviews.id}) FILTER (WHERE ${reviews.isHidden} = false)`,
    })
    .from(reviews)
    .where(eq(reviews.serviceId, serviceId));

  const breakdownRows = await db
    .select({ rating: reviews.rating, count: sql<number>`COUNT(${reviews.id})` })
    .from(reviews)
    .where(and(eq(reviews.serviceId, serviceId), eq(reviews.isHidden, false)))
    .groupBy(reviews.rating);

  const breakdown: ReviewBreakdown = {};
  for (const row of breakdownRows) {
    breakdown[String(row.rating)] = Number(row.count ?? 0);
  }

  const items = (
    await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        isHidden: reviews.isHidden,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(reviews)
      .leftJoin(users, eq(users.id, reviews.userId))
      .where(eq(reviews.serviceId, serviceId))
      .orderBy(desc(reviews.createdAt))
      .limit(10)
  ).map((row): ReviewItem => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    isHidden: row.isHidden ?? false,
    user:
      row.firstName || row.lastName
        ? {
            firstName: row.firstName,
            lastName: row.lastName,
          }
        : undefined,
  }));

  return {
    summary: {
      average: Number(summary?.average ?? 0),
      total: Number(summary?.total ?? 0),
      breakdown,
    },
    items,
  };
}

async function getBlockedDays(providerId: string) {
  const rows = await db
    .select({
      start: providerTimeOffs.startTime,
      end: providerTimeOffs.endTime,
    })
    .from(providerTimeOffs)
    .where(eq(providerTimeOffs.providerId, providerId));

  return rows.map((row) => ({ from: row.start, to: row.end }));
}

async function getServiceDetailData(slug: string, userId?: string | null): Promise<ServiceDetailData | null> {
  const rows = await db
    .select({
      id: services.id,
      slug: services.slug,
      title: services.title,
      description: services.description,
      pricingType: services.pricingType,
      priceInCents: services.priceInCents,
      priceNote: services.priceNote,
      category: services.category,
      coverImageUrl: services.coverImageUrl,
      chargesGst: services.chargesGst,
      createdAt: services.createdAt,
      serviceRegion: services.region,
      serviceSuburb: services.suburb,
      providerId: providers.id,
      providerUserId: providers.userId,
      providerHandle: providers.handle,
      providerBusinessName: providers.businessName,
      providerBio: providers.bio,
      providerTrustLevel: providers.trustLevel,
      providerTrustScore: providers.trustScore,
      providerVerified: providers.isVerified,
      avgRating: sql<number>`COALESCE(AVG(${reviews.rating}) FILTER (WHERE ${reviews.isHidden} = false), 0)`,
      reviewCount: sql<number>`COUNT(${reviews.id}) FILTER (WHERE ${reviews.isHidden} = false)`,
      favoriteCount: sql<number>`COUNT(${serviceFavorites.id})`,
      isFavorited: userId
        ? sql<boolean>`EXISTS (SELECT 1 FROM ${serviceFavorites} sf WHERE sf.service_id = ${services.id} AND sf.user_id = ${userId})`
        : sql<boolean>`false`,
    })
    .from(services)
    .innerJoin(providers, eq(services.providerId, providers.id))
    .leftJoin(reviews, eq(reviews.serviceId, services.id))
    .leftJoin(serviceFavorites, eq(serviceFavorites.serviceId, services.id))
      .where(and(eq(services.slug, slug), eq(providers.status, "approved"), providerNotCurrentlySuspendedWhere(new Date())))
    .groupBy(services.id, providers.id)
    .limit(1);

  const serviceRow = rows[0];
  if (!serviceRow) return null;

  const service: ServiceDetail = {
    id: serviceRow.id,
    slug: serviceRow.slug,
    title: serviceRow.title,
    description: serviceRow.description,
    pricingType: serviceRow.pricingType,
    priceInCents: serviceRow.priceInCents,
    priceNote: serviceRow.priceNote,
    category: serviceRow.category,
    coverImageUrl: serviceRow.coverImageUrl,
    chargesGst: serviceRow.chargesGst,
    createdAt: serviceRow.createdAt,
    region: serviceRow.serviceRegion,
    suburb: serviceRow.serviceSuburb,
    provider: {
      id: serviceRow.providerId,
      userId: serviceRow.providerUserId,
      handle: serviceRow.providerHandle,
      businessName: serviceRow.providerBusinessName,
      bio: serviceRow.providerBio,
      trustLevel: serviceRow.providerTrustLevel,
      trustScore: serviceRow.providerTrustScore ?? 0,
      isVerified: serviceRow.providerVerified ?? false,
      // baseSuburb: serviceRow.providerBaseSuburb,
      // baseRegion: serviceRow.providerBaseRegion,
      // serviceRadiusKm: serviceRow.providerRadius,
    },
    avgRating: Number(serviceRow.avgRating ?? 0),
    reviewCount: Number(serviceRow.reviewCount ?? 0),
    favoriteCount: Number(serviceRow.favoriteCount ?? 0),
    isFavorited: Boolean(serviceRow.isFavorited),
  };

  const [reviewData, blockedDays, similarServices, providerStats] = await Promise.all([
    getReviewData(service.id),
    getBlockedDays(service.provider.id),
    getSimilarServices(service.id).then((res) => res ?? []),
    getProviderStats(service.provider.id),
  ]);

  return {
    service,
    reviewSummary: reviewData.summary,
    reviewItems: reviewData.items,
    blockedDays,
    similarServices,
    providerStats,
  };
}

export async function generateMetadata({ params }: ServiceParams): Promise<Metadata> {
  const { slug } = await params;
  const service = await db.query.services.findFirst({
    where: eq(services.slug, slug),
    columns: { title: true, description: true },
  });

  if (!service) return {};

  const title = `${service.title} | Verial`;
  const description = service.description ?? "View service details on Verial.";

  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function ServiceDetailPage({ params }: ServiceParams) {
  const { slug } = await params;
  const { userId } = await auth();
  const data = await getServiceDetailData(slug, userId);

  if (!data) notFound();

  const { service, reviewSummary, reviewItems, blockedDays, similarServices, providerStats } = data;
  const trustScore = service.provider.trustScore ?? 0;
  const trustTier = getTrustTier(trustScore);
  const { Icon, color } = getTrustBadge(trustTier);
  const showAdminBadge = service.provider.isVerified && trustScore >= 85;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="relative w-full aspect-video bg-gray-200 rounded-lg overflow-hidden">
            {service.coverImageUrl ? (
              <Image src={service.coverImageUrl} alt={service.title} fill className="object-cover" priority />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">No image provided</div>
            )}
            <div className="absolute top-3 left-3">
              <Badge variant="secondary" className="bg-white/90 capitalize text-slate-900">
                {service.category.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="absolute top-3 right-3 sm:hidden">
              <ServiceFavoriteButton
                serviceId={service.id}
                initialIsFavorite={service.isFavorited}
                initialCount={service.favoriteCount}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-slate-900">{service.title}</h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                  <Badge variant="outline" className="capitalize">{service.category.replace(/_/g, " ")}</Badge>
                  {service.suburb || service.region ? (
                    <span className="text-slate-600">
                      {service.suburb}
                      {service.suburb && service.region ? ", " : ""}
                      {service.region}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="hidden sm:block">
                <ServiceFavoriteButton
                  serviceId={service.id}
                  initialIsFavorite={service.isFavorited}
                  initialCount={service.favoriteCount}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <span className="font-semibold">
                {service.reviewCount > 0 ? `${service.avgRating.toFixed(1)} / 5` : "No reviews yet"}
              </span>
              <span className="text-slate-500">
                {service.reviewCount} review{service.reviewCount === 1 ? "" : "s"}
              </span>
              <Separator orientation="vertical" className="h-5" />
              <span className="flex items-center gap-2 text-slate-600">
                <Icon className={`h-4 w-4 ${color}`} />
                {trustTier} trust · {Math.round(trustScore)}/100
              </span>
              {service.provider.isVerified && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  Verified provider
                </span>
              )}
              {showAdminBadge && (
                <span className="flex items-center gap-1 text-blue-600 font-semibold">
                  <CheckCircle className="h-4 w-4" /> Admin trusted
                </span>
              )}
            </div>
          </div>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">About this service</h2>
            <p className="text-slate-700 whitespace-pre-wrap">
              {service.description || "No description provided."}
            </p>
          </section>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-1.5">
                {service.provider.handle ? (
                  <Link href={`/p/${service.provider.handle}`} className="hover:underline font-semibold text-slate-900">
                    {service.provider.businessName ?? "Provider"}
                  </Link>
                ) : (
                  <p className="font-semibold text-slate-900">{service.provider.businessName ?? "Provider"}</p>
                )}
                {service.provider.handle ? (
                  <CardDescription>@{service.provider.handle}</CardDescription>
                ) : null}
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2">
                {service.provider.isVerified && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle className="h-4 w-4 text-emerald-600" /> Verified Provider
                  </Badge>
                )}
                <Badge variant="secondary" className={`gap-1 ${color}`}>
                  <Icon className="h-4 w-4" />
                  {trustTier} trust · {Math.round(trustScore)}
                </Badge>
                {showAdminBadge && (
                  <Badge variant="secondary" className="gap-1 text-blue-700">
                    <CheckCircle className="h-4 w-4" /> Admin trusted
                  </Badge>
                )}
                <ContactButton providerId={service.provider.id} serviceId={service.id} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>{service.provider.bio || "No bio provided."}</p>
              {service.suburb || service.region ? (
                <div className="text-slate-600">📍 Located in {service.suburb ? `${service.suburb}, ` : ""}{service.region ?? "New Zealand"}</div>
              ) : null}
            </CardContent>
          </Card>

          <ProviderStatsCard stats={providerStats} />

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Reviews</h2>
              <span className="text-sm text-slate-500">{reviewSummary.total} total</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <ReviewSummary
                averageRating={reviewSummary.average}
                totalReviews={reviewSummary.total}
                breakdown={reviewSummary.breakdown}
              />
              <ReviewList serviceId={service.id} initialItems={reviewItems} initialTotal={reviewSummary.total} />
            </div>
          </section>

          <SimilarServicesGrid services={similarServices} />
        </div>

        <div className="space-y-4">
          <ServiceBookingPanel
            serviceId={service.id}
            providerId={service.provider.id}
            pricingType={service.pricingType}
            priceInCents={service.priceInCents}
            priceNote={service.priceNote}
            chargesGst={service.chargesGst}
            blockedDays={blockedDays}
          />
        </div>
      </div>
    </div>
  );
}

