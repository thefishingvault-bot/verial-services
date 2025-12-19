"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LineChart, BarChart, PieChart } from "@/components/charts";
import { scheduleReport, getScheduledReports, cancelScheduledReport } from '@/lib/export-utils';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { RealTimeNotifications, NotificationItem } from '@/components/RealTimeNotifications';
import { LiveActivityIndicator, AutoRefreshToggle } from '@/components/LiveActivityIndicator';

type SortOption = "kyc_status" | "risk_score" | "created" | "business_name";

type KycProvider = {
  id: string;
  businessName: string;
  handle: string;
  status: string;
  kycStatus: "not_started" | "in_progress" | "pending_review" | "verified" | "rejected";
  kycSubmittedAt: Date | null;
  kycVerifiedAt: Date | null;
  identityDocumentUrl: string | null;
  businessDocumentUrl: string | null;
  stripeConnectId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  trustScore: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  totalBookings: number;
  completionRate: number;
  cancellationRate: number;
  totalReviews: number;
  avgRating: number;
  totalIncidents: number;
  unresolvedIncidents: number;
  createdAt: Date;
  daysActive: number;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  // KYC-specific fields
  kycCompletionPercentage: number;
  missingDocuments: string[];
  kycAge: number; // days since KYC submitted
  kycRiskFactors: string[];
  kycRecommendations: string[];
  kycAlerts: string[];
  documentVerificationStatus: {
    identity: "pending" | "verified" | "rejected" | "missing";
    business: "pending" | "verified" | "rejected" | "missing";
    bank: "pending" | "verified" | "rejected" | "missing";
  };
  stripeOnboardingStatus: "not_started" | "in_progress" | "completed" | "failed";
  complianceFlags: string[];
};

type KycAnalytics = {
  platformKycStats: {
    totalProviders: number;
    verifiedProviders: number;
    pendingReview: number;
    rejectedProviders: number;
    notStarted: number;
    inProgress: number;
    avgKycCompletionTime: number;
    kycCompletionRate: number;
  };
  riskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  documentStatus: {
    identityVerified: number;
    businessVerified: number;
    bankVerified: number;
    documentsMissing: number;
  };
  timelineMetrics: {
    kycSubmissions30d: number;
    kycVerifications30d: number;
    kycRejections30d: number;
    avgProcessingTime: number;
  };
  timelineSeries?: {
    points: Array<{
      name: string;
      submissions: number;
      verifications: number;
      rejections: number;
    }>;
  };
};

type ApiResponse = {
  providers: KycProvider[];
  analytics: KycAnalytics;
};

type ScheduledReport = {
  id: string;
  email: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  reportType: 'summary' | 'detailed';
};

type KycFilterPreset = {
  id: string;
  name: string;
  filters: {
    searchQuery: string;
    kycStatusFilter: string[];
    riskLevelFilter: string[];
    documentStatusFilter: string[];
    dateRange: { start: string; end: string };
    kycAgeRange: { min: string; max: string };
  };
  createdAt: string;
};

type ProviderKycNotificationPayload = {
  message?: string;
  actionUrl?: string;
};

function ScheduledReportsModal({
  onSchedule,
  onCancel,
  existingReports,
  onCancelReport
}: {
  onSchedule: (email: string, frequency: 'daily' | 'weekly' | 'monthly', reportType: 'summary' | 'detailed') => void;
  onCancel: () => void;
  existingReports: ScheduledReport[];
  onCancelReport: (reportId: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [reportType, setReportType] = useState<'summary' | 'detailed'>('summary');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      alert('Please enter an email address');
      return;
    }
    onSchedule(email.trim(), frequency, reportType);
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="admin@company.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frequency
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Report Type
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as 'summary' | 'detailed')}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="summary">Summary Report</option>
            <option value="detailed">Detailed Report</option>
          </select>
        </div>

        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Schedule Report
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>

      {existingReports.length > 0 && (
        <div className="mt-6 pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Scheduled Reports</h4>
          <div className="space-y-2">
            {existingReports.map((report) => (
              <div key={report.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                <div>
                  <span className="font-medium">{report.email}</span>
                  <span className="text-gray-500 ml-2">
                    {report.frequency} {report.reportType}
                  </span>
                </div>
                <button
                  onClick={() => onCancelReport(report.id)}
                  className="text-red-600 hover:text-red-900 text-xs"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminKycStatusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<KycProvider[]>([]);
  const [analytics, setAnalytics] = useState<KycAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [savedFilters, setSavedFilters] = useState<KycFilterPreset[]>([]);
  const [filterName, setFilterName] = useState('');
  const [kycStatusFilter, setKycStatusFilter] = useState<string[]>([]);
  const [riskLevelFilter, setRiskLevelFilter] = useState<string[]>([]);
  const [documentStatusFilter, setDocumentStatusFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [kycAgeRange, setKycAgeRange] = useState({ min: '', max: '' });

  // Real-time updates state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  const sortBy = (searchParams.get("sort") as SortOption) || "kyc_status";
  const sortOrder = searchParams.get("order") === "asc" ? "asc" : "desc";

  const fetchProviders = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        sort: sortBy,
        order: sortOrder,
      });
      const response = await fetch(`/api/admin/providers/kyc?${params}`);

      if (response.status === 403) {
        // Stop retrying on 403 - user is not authorized
        setError("You are not authorized to view this page.");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch KYC providers");
      }

      const data: ApiResponse = await response.json();
      setProviders(data.providers);
      setAnalytics(data.analytics);
    } catch (err) {
      console.error("Error fetching KYC providers:", err);
      setError("Something went wrong while loading KYC providers.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [sortBy, sortOrder]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Auto-refresh data (safe interval-based polling)
  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const id = window.setInterval(() => {
      fetchProviders({ silent: true });
    }, refreshInterval);
    return () => window.clearInterval(id);
  }, [autoRefreshEnabled, refreshInterval, fetchProviders]);

  useEffect(() => {
    // Load scheduled reports on component mount
    setScheduledReports(getScheduledReports());
  }, []);

  const handleExportCSV = () => {
    try {
      const filename = `kyc-status-report-${new Date().toISOString().split('T')[0]}.csv`;
      // Transform KYC data to match expected export format
      const exportData = providers.map(p => ({
        businessName: p.businessName,
        handle: p.handle,
        riskLevel: p.riskLevel,
        riskScore: p.riskScore,
        trustScore: p.trustScore,
        completionRate: p.completionRate,
        totalBookings: p.totalBookings,
        cancellationRate: p.cancellationRate,
        totalReviews: p.totalReviews,
        avgRating: p.avgRating,
        daysActive: p.daysActive,
        status: p.status,
        unresolvedIncidents: p.unresolvedIncidents,
        alerts: p.kycAlerts,
        recommendations: p.kycRecommendations,
        createdAt: p.createdAt,
        lastActivity: undefined,
        // Add KYC-specific fields
        kycStatus: p.kycStatus,
        kycCompletionPercentage: p.kycCompletionPercentage,
        missingDocuments: p.missingDocuments.join('; '),
        kycRiskFactors: p.kycRiskFactors.join('; '),
        complianceFlags: p.complianceFlags.join('; ')
      }));

      // Create CSV manually for KYC data
      const headers = [
        'Business Name', 'Handle', 'KYC Status', 'Risk Level', 'Risk Score', 'Trust Score',
        'Completion Rate (%)', 'Total Bookings', 'Days Active', 'Status',
        'KYC Completion (%)', 'Missing Documents', 'KYC Risk Factors', 'Compliance Flags',
        'Alerts', 'Recommendations', 'Created Date'
      ];

      const rows = exportData.map(provider => [
        provider.businessName,
        provider.handle,
        provider.kycStatus,
        provider.riskLevel,
        provider.riskScore,
        provider.trustScore,
        Number(provider.completionRate ?? 0).toFixed(2),
        provider.totalBookings,
        provider.daysActive,
        provider.status,
        provider.kycCompletionPercentage,
        provider.missingDocuments,
        provider.kycRiskFactors,
        provider.complianceFlags,
        provider.alerts.join('; '),
        provider.recommendations.join('; '),
        provider.createdAt.toLocaleDateString()
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const handleExportJSON = () => {
    try {
      const filename = `kyc-status-report-${new Date().toISOString().split('T')[0]}.json`;
      const jsonContent = JSON.stringify(providers, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const handleExportPDF = async () => {
    try {
      const filename = `kyc-status-report-${new Date().toISOString().split('T')[0]}.html`;

      const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>KYC Status Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
            .metric { text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .metric h3 { margin: 0 0 5px 0; color: #666; font-size: 12px; text-transform: uppercase; }
            .metric .value { font-size: 24px; font-weight: bold; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .risk-critical { background-color: #fee2e2; }
            .risk-high { background-color: #fef3c7; }
            .risk-medium { background-color: #dbeafe; }
            .risk-low { background-color: #d1fae5; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>KYC Status Report</h1>
            <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          </div>

          <div class="summary">
            <div class="metric">
              <h3>Total Providers</h3>
              <div class="value">${providers.length}</div>
            </div>
            <div class="metric">
              <h3>Verified</h3>
              <div class="value">${providers.filter(p => p.kycStatus === 'verified').length}</div>
            </div>
            <div class="metric">
              <h3>Pending Review</h3>
              <div class="value">${providers.filter(p => p.kycStatus === 'pending_review').length}</div>
            </div>
            <div class="metric">
              <h3>Critical Risk</h3>
              <div class="value">${providers.filter(p => p.riskLevel === 'critical').length}</div>
            </div>
          </div>

          <h2>KYC Provider Details</h2>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>KYC Status</th>
                <th>Risk Level</th>
                <th>Completion</th>
                <th>Missing Documents</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              ${providers.map(provider => `
                <tr class="risk-${provider.riskLevel}">
                  <td>${provider.businessName}<br><small>@${provider.handle}</small></td>
                  <td>${provider.kycStatus.replace(/_/g, ' ').toUpperCase()}</td>
                  <td>${provider.riskLevel.toUpperCase()}</td>
                  <td>${provider.kycCompletionPercentage}%</td>
                  <td>${provider.missingDocuments.length > 0 ? provider.missingDocuments.join(', ') : 'None'}</td>
                  <td>${provider.kycAlerts.length > 0 ? provider.kycAlerts.join('; ') : 'None'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>This report was generated automatically by the KYC Status Monitoring System.</p>
            <p>For questions or concerns, please contact the platform administration team.</p>
          </div>
        </body>
        </html>
      `;

      const blob = new Blob([reportHTML], { type: 'text/html;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setShowExportMenu(false);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('PDF generation failed. Please try again.');
    }
  };

  const handleScheduleReport = (email: string, frequency: 'daily' | 'weekly' | 'monthly', reportType: 'summary' | 'detailed') => {
    try {
      const newReport = scheduleReport(email, frequency, reportType);
      setScheduledReports(prev => [...prev, newReport]);
      setShowScheduleModal(false);
      alert('Report scheduled successfully!');
    } catch (error) {
      console.error('Scheduling failed:', error);
      alert('Failed to schedule report. Please try again.');
    }
  };

  const handleCancelScheduledReport = (reportId: string) => {
    try {
      cancelScheduledReport(reportId);
      setScheduledReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      console.error('Cancel failed:', error);
      alert('Failed to cancel scheduled report.');
    }
  };

  // Advanced filtering logic
  const applyAdvancedFilters = (providers: KycProvider[]) => {
    return providers.filter(provider => {
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          provider.businessName.toLowerCase().includes(query) ||
          provider.handle.toLowerCase().includes(query) ||
          provider.user.email.toLowerCase().includes(query) ||
          provider.user.firstName?.toLowerCase().includes(query) ||
          provider.user.lastName?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // KYC Status filter
      if (kycStatusFilter.length > 0 && !kycStatusFilter.includes(provider.kycStatus)) {
        return false;
      }

      // Risk level filter
      if (riskLevelFilter.length > 0 && !riskLevelFilter.includes(provider.riskLevel)) {
        return false;
      }

      // Document status filter
      if (documentStatusFilter.length > 0) {
        const hasMatchingDoc = documentStatusFilter.some(status => {
          switch (status) {
            case 'identity_missing': return provider.documentVerificationStatus.identity === 'missing';
            case 'business_missing': return provider.documentVerificationStatus.business === 'missing';
            case 'bank_missing': return provider.documentVerificationStatus.bank === 'missing';
            case 'all_verified': return provider.documentVerificationStatus.identity === 'verified' &&
                                provider.documentVerificationStatus.business === 'verified' &&
                                provider.documentVerificationStatus.bank === 'verified';
            default: return false;
          }
        });
        if (!hasMatchingDoc) return false;
      }

      // Date range filters
      if (dateRange.start && new Date(provider.createdAt) < new Date(dateRange.start)) {
        return false;
      }
      if (dateRange.end && new Date(provider.createdAt) > new Date(dateRange.end)) {
        return false;
      }

      // KYC age range
      if (kycAgeRange.min && provider.kycAge < parseInt(kycAgeRange.min)) {
        return false;
      }
      if (kycAgeRange.max && provider.kycAge > parseInt(kycAgeRange.max)) {
        return false;
      }

      return true;
    });
  };

  const saveFilterPreset = () => {
    if (!filterName.trim()) {
      alert('Please enter a name for the filter preset');
      return;
    }

    const preset = {
      id: Date.now().toString(),
      name: filterName,
      filters: {
        searchQuery,
        kycStatusFilter,
        riskLevelFilter,
        documentStatusFilter,
        dateRange,
        kycAgeRange
      },
      createdAt: new Date().toISOString()
    };

    const existingPresets = JSON.parse(localStorage.getItem('kycFilterPresets') || '[]');
    existingPresets.push(preset);
    localStorage.setItem('kycFilterPresets', JSON.stringify(existingPresets));
    setSavedFilters(existingPresets);
    setFilterName('');
    alert('Filter preset saved successfully!');
  };

  const loadFilterPreset = (preset: KycFilterPreset) => {
    setSearchQuery(preset.filters.searchQuery || '');
    setKycStatusFilter(preset.filters.kycStatusFilter || []);
    setRiskLevelFilter(preset.filters.riskLevelFilter || []);
    setDocumentStatusFilter(preset.filters.documentStatusFilter || []);
    setDateRange(preset.filters.dateRange || { start: '', end: '' });
    setKycAgeRange(preset.filters.kycAgeRange || { min: '', max: '' });
    setShowAdvancedFilters(true);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setKycStatusFilter([]);
    setRiskLevelFilter([]);
    setDocumentStatusFilter([]);
    setDateRange({ start: '', end: '' });
    setKycAgeRange({ min: '', max: '' });
  };

  // Load saved filters on component mount
  useEffect(() => {
    const presets = JSON.parse(localStorage.getItem('kycFilterPresets') || '[]');
    setSavedFilters(presets);
  }, []);

  // Apply filters to providers
  const filteredProviders = applyAdvancedFilters(providers);

  // Real-time updates setup
  const { isConnected, lastUpdate, isRetrying } = useRealTimeUpdates(
    {
      enabled: autoRefreshEnabled,
      updateInterval: refreshInterval,
    },
    (update) => {
      // Handle real-time updates - only update notifications, don't refetch data
      if (update.type === 'provider_update' || update.type === 'alert') {
        const data = update.data as ProviderKycNotificationPayload;
        const notification: NotificationItem = {
          id: update.id,
          type: update.type === 'alert' ? 'warning' : 'info',
          title: update.type === 'alert' ? 'KYC Alert' : 'KYC Update',
          message: data?.message || 'KYC status has been updated',
          timestamp: update.timestamp,
          read: false,
          actionUrl: data?.actionUrl,
          actionText: 'View Details'
        };
        setNotifications(prev => [notification, ...prev.slice(0, 49)]); // Keep last 50
      }

      // Note: Removed automatic data refresh to prevent infinite loops
      // Manual refresh via handleManualRefresh() is still available
    }
  );

  // Polling for periodic data refresh - DISABLED to prevent infinite loops
  // const { } = usePollingUpdates(
  //   async () => {
  //     await fetchProviders();
  //     return providers;
  //   },
  //   refreshInterval,
  //   autoRefreshEnabled
  // );

  const handleSortChange = (newSort: SortOption) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", newSort);
    router.push(`?${params.toString()}`);
  };

  const handleOrderChange = (newOrder: "asc" | "desc") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", newOrder);
    router.push(`?${params.toString()}`);
  };

  // Notification handlers
  const handleMarkNotificationAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const handleMarkAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleDismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleNotificationAction = (notification: NotificationItem) => {
    if (notification.actionUrl) {
      window.open(notification.actionUrl, '_blank');
    }
    handleMarkNotificationAsRead(notification.id);
  };

  // Real-time refresh handler
  const handleManualRefresh = () => {
    fetchProviders();
  };

  const handleAutoRefreshToggle = (enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
  };

  const handleRefreshIntervalChange = (interval: number) => {
    setRefreshInterval(interval);
    if (interval === 0) {
      setAutoRefreshEnabled(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading KYC Status Dashboard...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="text-red-600 text-lg">⚠️</div>
            <div>
              <h3 className="text-lg font-medium text-red-900">Error Loading KYC Data</h3>
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const totalProviders = providers.length;
  const verifiedProviders = providers.filter(p => p.kycStatus === "verified").length;
  const pendingReview = providers.filter(p => p.kycStatus === "pending_review").length;
  const rejectedProviders = providers.filter(p => p.kycStatus === "rejected").length;
  const criticalRisk = providers.filter(p => p.riskLevel === "critical").length;
  const highRisk = providers.filter(p => p.riskLevel === "high").length;
  const documentsMissing = providers.filter(p =>
    p.documentVerificationStatus.identity === 'missing' ||
    p.documentVerificationStatus.business === 'missing' ||
    p.documentVerificationStatus.bank === 'missing'
  ).length;

  const asPercent = (numerator: number, denominator: number) => {
    if (!denominator || denominator <= 0) return 0;
    const raw = (numerator / denominator) * 100;
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.min(100, raw);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">KYC Status Dashboard v2</h1>
          <p className="text-gray-600">
            Comprehensive KYC monitoring, risk assessment, and compliance management.
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-start gap-3 md:items-center md:justify-end">
          {/* Real-time Status */}
          <div className="flex flex-col items-end space-y-1">
            <LiveActivityIndicator
              isConnected={isConnected}
              lastUpdate={lastUpdate}
              isRetrying={isRetrying}
              onRefresh={handleManualRefresh}
              updateInterval={refreshInterval}
            />
            <AutoRefreshToggle
              enabled={autoRefreshEnabled}
              onToggle={handleAutoRefreshToggle}
              interval={refreshInterval}
              onIntervalChange={handleRefreshIntervalChange}
            />
          </div>

          {/* Notifications */}
          <RealTimeNotifications
            notifications={notifications}
            onMarkAsRead={handleMarkNotificationAsRead}
            onMarkAllAsRead={handleMarkAllNotificationsAsRead}
            onDismiss={handleDismissNotification}
            onAction={handleNotificationAction}
          />

          {/* Export Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2"
            >
              📊 Export
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
                <div className="py-1">
                  <button
                    onClick={handleExportCSV}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    📄 Export as CSV
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    📋 Export as JSON
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    📕 Generate PDF Report
                  </button>
                  <div className="border-t border-gray-100"></div>
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      setShowScheduleModal(true);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    ⏰ Schedule Reports
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setViewMode(viewMode === "table" ? "cards" : "table")}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            {viewMode === "table" ? "Card View" : "Table View"}
          </button>
        </div>
      </div>

      {/* KYC Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-gray-900">{verifiedProviders}</div>
              <div className="text-sm text-gray-600">Verified</div>
            </div>
            <div className="text-green-500">✅</div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totalProviders > 0 ? ((verifiedProviders / totalProviders) * 100).toFixed(1) : "0.0"}% completion rate
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-yellow-600">{pendingReview}</div>
              <div className="text-sm text-gray-600">Pending Review</div>
            </div>
            <div className="text-yellow-500">⏳</div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Requires immediate attention
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-red-600">{criticalRisk + highRisk}</div>
              <div className="text-sm text-gray-600">High Risk</div>
            </div>
            <div className="text-red-500">🚨</div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {criticalRisk} critical, {highRisk} high priority
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-blue-600">{documentsMissing}</div>
              <div className="text-sm text-gray-600">Documents Missing</div>
            </div>
            <div className="text-blue-500">📄</div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Incomplete submissions
          </div>
        </div>
      </div>

      {/* KYC Processing Alerts */}
      {pendingReview > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-600 text-lg">⚠️</div>
            <div>
              <h3 className="text-lg font-medium text-yellow-900">KYC Review Required</h3>
              <p className="text-yellow-800">
                {pendingReview} provider{pendingReview !== 1 ? 's' : ''} awaiting KYC verification review.
                Average processing time: {analytics?.timelineMetrics.avgProcessingTime || 0} days.
              </p>
            </div>
            <a
              href="#pending-review"
              className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 text-sm"
            >
              Review Now
            </a>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
            >
              <option value="kyc_status">KYC Status</option>
              <option value="risk_score">Risk Score</option>
              <option value="created">Newest</option>
              <option value="business_name">Business Name</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={sortOrder}
              onChange={(e) => handleOrderChange(e.target.value as "asc" | "desc")}
            >
              <option value="desc">Highest First</option>
              <option value="asc">Lowest First</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">KYC Status</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={kycStatusFilter.length === 1 ? kycStatusFilter[0] : "all"}
              onChange={(e) => {
                const value = e.target.value;
                setKycStatusFilter(value === "all" ? [] : [value]);
              }}
            >
              <option value="all">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending_review">Pending Review</option>
              <option value="in_progress">In Progress</option>
              <option value="rejected">Rejected</option>
              <option value="not_started">Not Started</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={riskLevelFilter.length === 1 ? riskLevelFilter[0] : "all"}
              onChange={(e) => {
                const value = e.target.value;
                setRiskLevelFilter(value === "all" ? [] : [value]);
              }}
            >
              <option value="all">All Risks</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Documents</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={documentStatusFilter.length === 1 ? documentStatusFilter[0] : "all"}
              onChange={(e) => {
                const value = e.target.value;
                const mapped =
                  value === "all" ? [] :
                  value === "complete" ? ["all_verified"] :
                  value === "missing" ? ["any_missing"] :
                  value === "pending" ? ["any_pending"] : [];
                setDocumentStatusFilter(mapped);
              }}
            >
              <option value="all">All</option>
              <option value="complete">Complete</option>
              <option value="missing">Missing</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Advanced Filters Section */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Advanced Filters</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="text-blue-600 hover:text-blue-900 text-sm flex items-center gap-1"
            >
              {showAdvancedFilters ? '🔽 Hide' : '🔼 Show'} Advanced Filters
            </button>
            <button
              onClick={clearAllFilters}
              className="text-gray-600 hover:text-gray-900 text-sm"
            >
              Clear All
            </button>
          </div>
        </div>

        {showAdvancedFilters && (
          <div className="space-y-4">
            {/* Search Query */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Providers</label>
              <input
                type="text"
                placeholder="Search by name, handle, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border px-3 py-2 rounded"
              />
            </div>

            {/* Multi-select Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* KYC Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KYC Status</label>
                <div className="space-y-1">
                  {['not_started', 'in_progress', 'pending_review', 'verified', 'rejected'].map(status => (
                    <label key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={kycStatusFilter.includes(status)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setKycStatusFilter(prev => [...prev, status]);
                          } else {
                            setKycStatusFilter(prev => prev.filter(s => s !== status));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Risk Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
                <div className="space-y-1">
                  {['low', 'medium', 'high', 'critical'].map(level => (
                    <label key={level} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={riskLevelFilter.includes(level)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setRiskLevelFilter(prev => [...prev, level]);
                          } else {
                            setRiskLevelFilter(prev => prev.filter(l => l !== level));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm capitalize">{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Document Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Status</label>
                <div className="space-y-1">
                  {[
                    { value: 'identity_missing', label: 'Identity Missing' },
                    { value: 'business_missing', label: 'Business Missing' },
                    { value: 'bank_missing', label: 'Bank Missing' },
                    { value: 'all_verified', label: 'All Verified' }
                  ].map(type => (
                    <label key={type.value} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={documentStatusFilter.includes(type.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDocumentStatusFilter(prev => [...prev, type.value]);
                          } else {
                            setDocumentStatusFilter(prev => prev.filter(t => t !== type.value));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Date Range Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration Date Range</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KYC Age (Days)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    value={kycAgeRange.min}
                    onChange={(e) => setKycAgeRange(prev => ({ ...prev, min: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    value={kycAgeRange.max}
                    onChange={(e) => setKycAgeRange(prev => ({ ...prev, max: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Filter Presets */}
            <div className="border-t pt-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Save Filter Preset</label>
                  <input
                    type="text"
                    placeholder="Preset name..."
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className="w-full border px-3 py-2 rounded text-sm"
                  />
                </div>
                <button
                  onClick={saveFilterPreset}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
                >
                  Save Preset
                </button>
              </div>

              {savedFilters.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Load Preset</label>
                  <div className="flex flex-wrap gap-2">
                    {savedFilters.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => loadFilterPreset(preset)}
                        className="text-blue-600 hover:text-blue-900 text-sm bg-blue-50 px-3 py-1 rounded border"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* KYC Analytics Section */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">KYC Analytics & Trends</h3>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {analytics?.platformKycStats.kycCompletionRate.toFixed(1) || 0}%
            </div>
            <div className="text-sm text-gray-600">KYC Completion Rate</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {analytics?.timelineMetrics.kycSubmissions30d || 0}
            </div>
            <div className="text-sm text-gray-600">Submissions (30d)</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {analytics?.timelineMetrics.avgProcessingTime || 0}
            </div>
            <div className="text-sm text-gray-600">Avg Processing Time</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {analytics?.timelineMetrics.kycVerifications30d || 0}
            </div>
            <div className="text-sm text-gray-600">Verifications (30d)</div>
          </div>
        </div>

        {/* KYC Status Distribution */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">KYC Status Distribution</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <PieChart
                data={[
                  { name: 'Verified', value: verifiedProviders, color: '#10B981' },
                  { name: 'Pending Review', value: pendingReview, color: '#F59E0B' },
                  { name: 'In Progress', value: providers.filter(p => p.kycStatus === 'in_progress').length, color: '#3B82F6' },
                  { name: 'Rejected', value: rejectedProviders, color: '#EF4444' },
                  { name: 'Not Started', value: providers.filter(p => p.kycStatus === 'not_started').length, color: '#6B7280' }
                ]}
                width={250}
                height={250}
              />
            </div>
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Risk Level Distribution</h5>
              <BarChart
                data={[
                  { name: 'Low Risk', value: providers.filter(p => p.riskLevel === 'low').length, color: '#10B981' },
                  { name: 'Medium Risk', value: providers.filter(p => p.riskLevel === 'medium').length, color: '#F59E0B' },
                  { name: 'High Risk', value: providers.filter(p => p.riskLevel === 'high').length, color: '#F97316' },
                  { name: 'Critical Risk', value: providers.filter(p => p.riskLevel === 'critical').length, color: '#EF4444' }
                ]}
                width={300}
                height={200}
              />
            </div>
          </div>
        </div>

        {/* Processing Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">KYC Processing Trends</h4>
            <LineChart
              data={(analytics?.timelineSeries?.points ?? []).map((p) => ({
                name: p.name,
                value: p.verifications,
              }))}
              width={300}
              height={150}
              color="#10B981"
            />
            <div className="text-xs text-gray-500 mt-2">
              Weekly verifications (last 6 weeks)
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Document Verification Status</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">Identity Documents</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{analytics?.documentStatus.identityVerified || 0}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${asPercent((analytics?.documentStatus.identityVerified || 0) as number, totalProviders)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">Business Documents</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{analytics?.documentStatus.businessVerified || 0}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${asPercent((analytics?.documentStatus.businessVerified || 0) as number, totalProviders)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">Bank Verification</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{analytics?.documentStatus.bankVerified || 0}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full"
                      style={{ width: `${asPercent((analytics?.documentStatus.bankVerified || 0) as number, totalProviders)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Management & Compliance */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Risk Management & Compliance</h3>

        {/* Active Alerts */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Active KYC Alerts</h4>
          <div className="space-y-3">
            {providers
              .filter(p => p.kycAlerts.length > 0)
              .slice(0, 5)
              .map(provider => (
                <div key={provider.id} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium text-red-900">{provider.businessName}</span>
                      <span className="text-sm text-red-700 ml-2">@{provider.handle}</span>
                    </div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      provider.riskLevel === "critical" ? "bg-red-100 text-red-800" :
                      provider.riskLevel === "high" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {provider.riskLevel.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {provider.kycAlerts.map((alert, index) => (
                      <div key={index} className="text-sm text-red-800 flex items-center gap-2">
                        <span className="text-red-600">🚨</span>
                        {alert}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                      <a
                        href={`/dashboard/admin/providers/${provider.id}#kyc`}
                        className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                      >
                        Review KYC
                      </a>
                      {provider.user.email ? (
                        <a
                          href={`mailto:${provider.user.email}`}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                          Contact Provider
                        </a>
                      ) : (
                        <a
                          href={`/dashboard/admin/providers/${provider.id}`}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                          View Provider
                        </a>
                      )}
                    <a
                      href={`/dashboard/admin/providers/${provider.id}`}
                      className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                    >
                      View Details
                    </a>
                  </div>
                </div>
              ))}
            {providers.filter(p => p.kycAlerts.length > 0).length === 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <span className="text-green-800">✅ No active KYC alerts</span>
              </div>
            )}
          </div>
        </div>

        {/* Automated Recommendations */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Automated Recommendations</h4>
          <div className="space-y-3">
            {providers
              .filter(p => p.kycRecommendations.length > 0)
              .slice(0, 5)
              .map(provider => (
                <div key={provider.id} className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium text-blue-900">{provider.businessName}</span>
                      <span className="text-sm text-blue-700 ml-2">@{provider.handle}</span>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {provider.kycRecommendations.length} recommendations
                    </span>
                  </div>
                  <div className="space-y-1">
                    {provider.kycRecommendations.slice(0, 2).map((rec, index) => (
                      <div key={index} className="text-sm text-blue-800 flex items-center gap-2">
                        <span className="text-blue-600">💡</span>
                        {rec}
                      </div>
                    ))}
                    {provider.kycRecommendations.length > 2 && (
                      <div className="text-xs text-blue-600">
                        +{provider.kycRecommendations.length - 2} more recommendations
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a
                      href={`/dashboard/admin/providers/${provider.id}#kyc`}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      Apply All
                    </a>
                    <a
                      href={`/dashboard/admin/providers/${provider.id}#kyc`}
                      className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                    >
                      Review
                    </a>
                  </div>
                </div>
              ))}
            {providers.filter(p => p.kycRecommendations.length > 0).length === 0 && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                <span className="text-gray-600">No automated recommendations at this time</span>
              </div>
            )}
          </div>
        </div>

        {/* Compliance Monitoring */}
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-3">Compliance Monitoring</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600 mb-1">
                {providers.filter(p => p.complianceFlags.length === 0).length}
              </div>
              <div className="text-sm text-green-800">Compliant Providers</div>
              <div className="text-xs text-green-600 mt-1">No compliance issues</div>
            </div>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-600 mb-1">
                {providers.filter(p => p.complianceFlags.length > 0 && p.complianceFlags.length <= 2).length}
              </div>
              <div className="text-sm text-yellow-800">Minor Issues</div>
              <div className="text-xs text-yellow-600 mt-1">Requires attention</div>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600 mb-1">
                {providers.filter(p => p.complianceFlags.length > 2).length}
              </div>
              <div className="text-sm text-red-800">Critical Issues</div>
              <div className="text-xs text-red-600 mt-1">Immediate action required</div>
            </div>
          </div>
        </div>
      </div>

      {/* Provider List */}
      <div id="pending-review">
      {viewMode === "table" ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  KYC Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documents
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completion
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProviders.map((provider) => (
                <tr key={provider.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {provider.businessName}
                      </div>
                      <div className="text-sm text-gray-500">@{provider.handle}</div>
                      <div className="text-xs text-gray-400">
                        {provider.user.firstName} {provider.user.lastName}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {provider.kycAlerts.length > 0 && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Alerts
                          </span>
                        )}
                        {provider.complianceFlags.length > 0 && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            Compliance
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      provider.kycStatus === "verified" ? "bg-green-100 text-green-800" :
                      provider.kycStatus === "pending_review" ? "bg-yellow-100 text-yellow-800" :
                      provider.kycStatus === "in_progress" ? "bg-blue-100 text-blue-800" :
                      provider.kycStatus === "rejected" ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {provider.kycStatus.replace("_", " ").toUpperCase()}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">
                      {provider.kycSubmittedAt && `Submitted: ${provider.kycSubmittedAt.toLocaleDateString()}`}
                      {provider.kycVerifiedAt && `Verified: ${provider.kycVerifiedAt.toLocaleDateString()}`}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      provider.riskLevel === "critical" ? "bg-red-100 text-red-800" :
                      provider.riskLevel === "high" ? "bg-orange-100 text-orange-800" :
                      provider.riskLevel === "medium" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      {provider.riskLevel.toUpperCase()}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">
                      Score: {provider.riskScore}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          provider.documentVerificationStatus.identity === 'verified' ? 'bg-green-500' :
                          provider.documentVerificationStatus.identity === 'pending' ? 'bg-yellow-500' :
                          provider.documentVerificationStatus.identity === 'rejected' ? 'bg-red-500' :
                          'bg-gray-500'
                        }`}></span>
                        <span className="text-xs">Identity</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          provider.documentVerificationStatus.business === 'verified' ? 'bg-green-500' :
                          provider.documentVerificationStatus.business === 'pending' ? 'bg-yellow-500' :
                          provider.documentVerificationStatus.business === 'rejected' ? 'bg-red-500' :
                          'bg-gray-500'
                        }`}></span>
                        <span className="text-xs">Business</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          provider.documentVerificationStatus.bank === 'verified' ? 'bg-green-500' :
                          provider.documentVerificationStatus.bank === 'pending' ? 'bg-yellow-500' :
                          provider.documentVerificationStatus.bank === 'rejected' ? 'bg-red-500' :
                          'bg-gray-500'
                        }`}></span>
                        <span className="text-xs">Bank</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {provider.kycCompletionPercentage}%
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${provider.kycCompletionPercentage}%` }}
                      ></div>
                    </div>
                    {provider.missingDocuments.length > 0 && (
                      <div className="text-xs text-red-600 mt-1">
                        {provider.missingDocuments.length} missing
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <a
                        href={`/dashboard/admin/providers/${provider.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </a>
                      {provider.kycStatus === "pending_review" && (
                        <a
                          href={`/dashboard/admin/providers/${provider.id}#kyc`}
                          className="text-green-600 hover:text-green-900"
                        >
                          Review
                        </a>
                      )}
                      {provider.kycStatus === "verified" && (
                        <a
                          href={`/dashboard/admin/providers/${provider.id}#kyc`}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Update
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProviders.map((provider) => (
            <div key={provider.id} className="border rounded-lg p-4 bg-white shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-lg">{provider.businessName}</h3>
                  <p className="text-sm text-gray-600">@{provider.handle}</p>
                  <p className="text-sm text-gray-500">
                    {provider.user.firstName} {provider.user.lastName}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    provider.status === "approved" ? "bg-green-100 text-green-800" :
                    provider.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {provider.status}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium">KYC Status:</span>
                  <div className={`inline-block ml-2 px-2 py-1 rounded text-xs font-medium ${
                    provider.kycStatus === "verified" ? "bg-green-100 text-green-800" :
                    provider.kycStatus === "pending_review" ? "bg-yellow-100 text-yellow-800" :
                    provider.kycStatus === "in_progress" ? "bg-blue-100 text-blue-800" :
                    provider.kycStatus === "rejected" ? "bg-red-100 text-red-800" :
                    "bg-gray-100 text-gray-800"
                  }`}>
                    {provider.kycStatus.replace("_", " ")}
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium">Risk Level:</span>
                  <div className={`inline-block ml-2 px-2 py-1 rounded text-xs font-medium ${
                    provider.riskLevel === "critical" ? "bg-red-100 text-red-800" :
                    provider.riskLevel === "high" ? "bg-orange-100 text-orange-800" :
                    provider.riskLevel === "medium" ? "bg-yellow-100 text-yellow-800" :
                    "bg-green-100 text-green-800"
                  }`}>
                    {provider.riskLevel} ({provider.riskScore})
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium">Completion:</span>
                  <div className="mt-1">
                    <div className="text-sm text-gray-900">{provider.kycCompletionPercentage}%</div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${provider.kycCompletionPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  <div>Stripe: {provider.stripeConnectId ? "Connected" : "Not Connected"}</div>
                  <div>Charges: {provider.chargesEnabled ? "Enabled" : "Disabled"}</div>
                  <div>Payouts: {provider.payoutsEnabled ? "Enabled" : "Disabled"}</div>
                  {provider.kycSubmittedAt && (
                    <div>Submitted: {provider.kycSubmittedAt.toLocaleDateString()}</div>
                  )}
                  {provider.kycVerifiedAt && (
                    <div>Verified: {provider.kycVerifiedAt.toLocaleDateString()}</div>
                  )}
                </div>

                {provider.kycAlerts.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded p-2">
                    <div className="text-xs font-medium text-red-900 mb-1">Alerts:</div>
                    {provider.kycAlerts.slice(0, 2).map((alert, index) => (
                      <div key={index} className="text-xs text-red-800">• {alert}</div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <a
                    href={`/dashboard/admin/providers/${provider.id}`}
                    className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 text-center"
                  >
                    View Details
                  </a>
                  {provider.kycStatus === "pending_review" && (
                    <a
                      href={`/dashboard/admin/providers/${provider.id}#kyc`}
                      className="flex-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 text-center"
                    >
                      Review KYC
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Scheduled Reports Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Schedule KYC Reports</h3>
            <ScheduledReportsModal
              onSchedule={(email, frequency, reportType) => {
                handleScheduleReport(email, frequency, reportType);
              }}
              onCancel={() => setShowScheduleModal(false)}
              existingReports={scheduledReports}
              onCancelReport={handleCancelScheduledReport}
            />
          </div>
        </div>
      )}
    </div>
  );
}
