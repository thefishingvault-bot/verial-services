import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { disputes, bookings, users, providers, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  MessageSquare,
  Shield,
  User,
  Calendar,
  AlertTriangle,
  Eye,
  Phone,
  Mail
} from "lucide-react";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ disputeId: string }>;
}) {
  const user = await currentUser();
  if (!user?.id) {
    redirect("/dashboard");
  }

  try {
    await requireAdmin(user.id);
  } catch {
    redirect("/dashboard");
  }

  const { disputeId } = await params;

  // Get basic dispute info
  const [disputeBase] = await db
    .select({
      id: disputes.id,
      reason: disputes.reason,
      description: disputes.description,
      evidenceUrls: disputes.evidenceUrls,
      amountDisputed: disputes.amountDisputed,
      status: disputes.status,
      adminDecision: disputes.adminDecision,
      adminNotes: disputes.adminNotes,
      refundAmount: disputes.refundAmount,
      createdAt: disputes.createdAt,
      resolvedAt: disputes.resolvedAt,
      initiatorType: disputes.initiatorType,
      bookingId: disputes.bookingId,
      initiatorId: disputes.initiatorId,
    })
    .from(disputes)
    .where(eq(disputes.id, disputeId))
    .limit(1);

  if (!disputeBase) {
    redirect("/dashboard/admin/disputes");
  }

  // Get booking details
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      totalAmount: bookings.priceAtBooking,
      scheduledAt: bookings.scheduledDate,
      serviceId: bookings.serviceId,
      providerId: bookings.providerId,
      userId: bookings.userId,
    })
    .from(bookings)
    .where(eq(bookings.id, disputeBase.bookingId))
    .limit(1);

  if (!booking) {
    redirect("/dashboard/admin/disputes");
  }

  // Get service details
  const [service] = await db
    .select({
      id: services.id,
      name: services.title,
      description: services.description,
      price: services.priceInCents,
    })
    .from(services)
    .where(eq(services.id, booking.serviceId))
    .limit(1);

  // Get provider details
  const [provider] = await db
    .select({
      id: providers.id,
      businessName: providers.businessName,
      handle: providers.handle,
      trustScore: providers.trustScore,
      trustLevel: providers.trustLevel,
      userId: providers.userId,
    })
    .from(providers)
    .where(eq(providers.id, booking.providerId))
    .limit(1);

  // Get user details
  const [initiator] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, disputeBase.initiatorId))
    .limit(1);

  const [customer] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, booking.userId))
    .limit(1);

  const [providerUser] = provider ? await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, provider.userId))
    .limit(1) : [null];

  const dispute = {
    ...disputeBase,
    booking: {
      ...booking,
      service: service || { id: '', name: '', description: '', price: 0 },
    },
    initiator: initiator || { id: '', firstName: null, lastName: null, email: '' },
    customer: customer || { id: '', firstName: null, lastName: null, email: '' },
    provider: provider ? {
      ...provider,
      user: providerUser || { firstName: null, lastName: null, email: '' },
    } : undefined,
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin/disputes">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Disputes
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dispute Resolution</h1>
            <p className="text-muted-foreground mt-2">
              Review and resolve dispute #{dispute.id}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <MessageSquare className="mr-2 h-4 w-4" />
            Contact Parties
          </Button>
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Add Note
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      {(() => {
          function getDaysOpen(createdAt: Date, resolvedAt?: Date | null) {
            const end = resolvedAt ?? new Date();
            return Math.floor((end.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
          }
          const daysOpen = getDaysOpen(dispute.createdAt, dispute.resolvedAt);
        const isHighValue = dispute.amountDisputed && dispute.amountDisputed > 5000;
        const isUrgent = daysOpen > 3;
        return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Badge variant={
                  dispute.status === "open" ? "destructive" :
                  dispute.status === "under_review" ? "secondary" :
                  dispute.status === "resolved" ? "default" :
                  "outline"
                } className="text-sm">
                  {dispute.status.replace("_", " ")}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Amount Disputed</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dispute.amountDisputed ? `$${(dispute.amountDisputed / 100).toFixed(2)}` : "N/A"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Days Open</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {daysOpen}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Priority</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Badge variant={
                  isHighValue || isUrgent ? "destructive" : "secondary"
                }>
                  {isHighValue ? "High Value" : isUrgent ? "Urgent" : "Normal"}
                </Badge>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dispute Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Dispute Details
              </CardTitle>
              <CardDescription>
                Reason: <span className="font-medium capitalize">{dispute.reason.replace("_", " ")}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Description</Label>
                <div className="mt-2 p-3 bg-muted rounded-md text-sm">
                  {dispute.description}
                </div>
              </div>

              {dispute.adminNotes && (
                <div>
                  <Label className="text-sm font-medium">Admin Notes</Label>
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                    {dispute.adminNotes}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <Label className="text-sm font-medium">Created</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {dispute.createdAt.toLocaleDateString()} at {dispute.createdAt.toLocaleTimeString()}
                  </div>
                </div>
                {dispute.resolvedAt && (
                  <div>
                    <Label className="text-sm font-medium">Resolved</Label>
                    <div className="text-sm text-muted-foreground mt-1">
                      {dispute.resolvedAt.toLocaleDateString()} at {dispute.resolvedAt.toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Booking Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Booking Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Service</Label>
                  <div className="text-sm mt-1">{dispute.booking.service.name}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Booking Status</Label>
                  <Badge variant={
                    dispute.booking.status === "completed" ? "default" :
                    dispute.booking.status === "confirmed" ? "secondary" :
                    dispute.booking.status === "canceled" ? "destructive" :
                    "outline"
                  } className="mt-1">
                    {dispute.booking.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium">Scheduled Date</Label>
                  <div className="text-sm mt-1">
                    {dispute.booking.scheduledAt ?
                      `${dispute.booking.scheduledAt.toLocaleDateString()} at ${dispute.booking.scheduledAt.toLocaleTimeString()}` :
                      "Not scheduled"}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Total Amount</Label>
                  <div className="text-lg font-semibold mt-1">
                    ${(dispute.booking.totalAmount / 100).toFixed(2)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resolution Form */}
          {dispute.status === "under_review" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Make Resolution Decision
                </CardTitle>
                <CardDescription>
                  Choose how to resolve this dispute and provide detailed reasoning.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={`/api/admin/disputes/${dispute.id}/resolve`} method="POST" className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="decision">Decision *</Label>
                      <Select name="decision" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a decision..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="refund_customer">Full Refund to Customer</SelectItem>
                          <SelectItem value="partial_refund">Partial Refund to Customer</SelectItem>
                          <SelectItem value="no_refund">No Refund</SelectItem>
                          <SelectItem value="service_redo">Service Redo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="refundAmount">Refund Amount (cents)</Label>
                      <Input
                        id="refundAmount"
                        name="refundAmount"
                        type="number"
                        placeholder="0"
                        min="0"
                        max={dispute.booking.totalAmount}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty for no refund. Max: ${(dispute.booking.totalAmount / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="adminNotes">Resolution Notes *</Label>
                    <Textarea
                      id="adminNotes"
                      name="adminNotes"
                      rows={4}
                      required
                      placeholder="Explain your decision and reasoning..."
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Button type="submit">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Resolve Dispute
                    </Button>
                    <Button asChild variant="outline" type="button">
                      <Link href="/dashboard/admin/disputes">Cancel</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Resolution Summary */}
          {dispute.status === "resolved" && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-5 w-5" />
                  Resolution Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-green-800">Decision</Label>
                    <div className="text-sm mt-1 capitalize font-medium">
                      {dispute.adminDecision?.replace("_", " ")}
                    </div>
                  </div>
                  {dispute.refundAmount && (
                    <div>
                      <Label className="text-sm font-medium text-green-800">Refund Amount</Label>
                      <div className="text-lg font-semibold mt-1">
                        ${(dispute.refundAmount / 100).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Parties Involved */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Parties Involved
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Initiator */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {dispute.initiatorType}
                  </Badge>
                  <span className="text-sm font-medium">Initiator</span>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">
                    {dispute.initiator.firstName} {dispute.initiator.lastName}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    {dispute.initiator.email}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Message
                    </Button>
                    <Button size="sm" variant="outline">
                      <Phone className="h-3 w-3 mr-1" />
                      Call
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Customer */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Customer</Badge>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">
                    {dispute.customer?.firstName} {dispute.customer?.lastName}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    {dispute.customer?.email}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Message
                    </Button>
                    <Button size="sm" variant="outline">
                      <Phone className="h-3 w-3 mr-1" />
                      Call
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Provider */}
              {dispute.provider && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Provider</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">{dispute.provider.businessName}</div>
                    <div className="text-sm text-muted-foreground">@{dispute.provider.handle}</div>
                    <div className="text-sm text-muted-foreground">
                      {dispute.provider.user.firstName} {dispute.provider.user.lastName}
                    </div>
                    <Badge variant={
                      dispute.provider.trustLevel === "platinum" ? "default" :
                      dispute.provider.trustLevel === "gold" ? "secondary" :
                      dispute.provider.trustLevel === "silver" ? "outline" :
                      "outline"
                    } className="text-xs">
                      {dispute.provider.trustLevel} ({dispute.provider.trustScore})
                    </Badge>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline">
                        <MessageSquare className="h-3 w-3 mr-1" />
                        Message
                      </Button>
                      <Button size="sm" variant="outline">
                        <Eye className="h-3 w-3 mr-1" />
                        Profile
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evidence */}
          {dispute.evidenceUrls && dispute.evidenceUrls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Evidence ({dispute.evidenceUrls.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dispute.evidenceUrls.map((url, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 border rounded">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 flex-1 truncate"
                      >
                        Evidence {index + 1}
                      </a>
                      <Button size="sm" variant="ghost">
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2" />
                View Booking Details
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <MessageSquare className="h-4 w-4 mr-2" />
                Send Template Message
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Shield className="h-4 w-4 mr-2" />
                Escalate Dispute
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}