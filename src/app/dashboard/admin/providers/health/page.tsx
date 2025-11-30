"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LineChart, BarChart, PieChart, AreaChart } from "@/components/charts";
import { exportToCSV, exportToJSON, generatePDFReport, scheduleReport, getScheduledReports, cancelScheduledReport } from '@/lib/export-utils';
import { useRealTimeUpdates, usePollingUpdates } from '@/hooks/useRealTimeUpdates';
import { RealTimeNotifications, NotificationItem } from '@/components/RealTimeNotifications';
import { LiveActivityIndicator, AutoRefreshToggle } from '@/components/LiveActivityIndicator';

type SortOption = "bookings" | "cancellations" | "reviews" | "trust" | "risk" | "created";

type ProviderHealth = {
  id: string;
  businessName: string;
  handle: string;
  status: string;
  trustLevel: string;
  trustScore: number;
  createdAt: Date;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalReviews: number;
  avgRating: number | null;
  cancellationRate: number;
  completionRate: number;
  // New v2 fields
  bookings30d: number;
  completed30d: number;
  cancelled30d: number;
  bookings90d: number;
  completed90d: number;
  cancelled90d: number;
  completionRate30d: number;
  cancellationRate30d: number;
  completionRate90d: number;
  cancellationRate90d: number;
  totalIncidents: number;
  unresolvedIncidents: number;
  recentIncidents: number;
  totalSuspensions: number;
  activeSuspensions: number;
  totalDisputes: number;
  unresolvedDisputes: number;
  totalRefunds: number;
  totalRefundAmount: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskFactors: string[];
  recommendations: string[];
  alerts: string[];
  bookingFrequency: number;
  daysActive: number;
  hasActiveSuspension: boolean;
  hasUnresolvedIncidents: boolean;
  hasRecentIncidents: boolean;
  applicableRiskRules: Array<{
    id: string;
    name: string;
    incidentType: string;
    severity: string;
    trustScorePenalty: number;
    autoSuspend: boolean;
    suspendDurationDays: number | null;
  }>;
};

type AnalyticsData = {
  platformAverages: {
    avgCompletionRate: number;
    avgCancellationRate: number;
    avgTrustScore: number;
    totalBookings: number;
    totalIncidents: number;
    highTrustProviders: number;
  };
  growthMetrics: {
    newProviders30d: number;
    newProviders90d: number;
    avgBookingGrowth: number;
    avgCompletionGrowth: number;
  };
  activityPatterns: {
    peakHours: string;
    busiestDays: string;
    avgResponseTime: number;
  };
  summary: {
    totalProviders: number;
    activeProviders: number;
    riskDistribution: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
};

type ApiResponse = {
  providers: ProviderHealth[];
  analytics: AnalyticsData;
};

type ScheduledReport = {
  id: string;
  email: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  reportType: 'summary' | 'detailed';
};

type FilterPreset = {
  id: string;
  name: string;
  filters: {
    searchQuery: string;
    selectedRiskLevels: string[];
    selectedStatuses: string[];
    selectedIncidentTypes: string[];
    dateRange: { start: string; end: string };
    activityDateRange: { start: string; end: string };
    completionRateRange: { min: string; max: string };
    trustScoreRange: { min: string; max: string };
    bookingCountRange: { min: string; max: string };
  };
  createdAt: string;
};

type ProviderHealthNotificationPayload = {
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

export default function AdminProviderHealthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [savedFilters, setSavedFilters] = useState<FilterPreset[]>([]);
  const [filterName, setFilterName] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [activityDateRange, setActivityDateRange] = useState({ start: '', end: '' });
  const [completionRateRange, setCompletionRateRange] = useState({ min: '', max: '' });
  const [trustScoreRange, setTrustScoreRange] = useState({ min: '', max: '' });
  const [bookingCountRange, setBookingCountRange] = useState({ min: '', max: '' });
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedIncidentTypes, setSelectedIncidentTypes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [riskScoreRange, setRiskScoreRange] = useState({ min: '', max: '' });

  // Real-time updates state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  const sortBy = (searchParams.get("sort") as SortOption) || "risk";
  const sortOrder = searchParams.get("order") === "asc" ? "asc" : "desc";
  const riskFilter = searchParams.get("risk") || "all";
  const statusFilter = searchParams.get("status") || "all";
  const incidentsFilter = searchParams.get("incidents") || "all";

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort: sortBy,
        order: sortOrder,
        risk: riskFilter,
        status: statusFilter,
        incidents: incidentsFilter,
      });
      const response = await fetch(`/api/admin/providers/health?${params}`);
      if (response.ok) {
        const data: ApiResponse = await response.json();
        setProviders(data.providers);
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error("Error fetching providers:", error);
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder, riskFilter, statusFilter, incidentsFilter]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    // Load scheduled reports on component mount
    setScheduledReports(getScheduledReports());
  }, []);

  const handleExportCSV = () => {
    try {
      const filename = `provider-health-report-${new Date().toISOString().split('T')[0]}.csv`;
      exportToCSV(providers, filename);
      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const handleExportJSON = () => {
    try {
      const filename = `provider-health-report-${new Date().toISOString().split('T')[0]}.json`;
      exportToJSON(providers, filename);
      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const handleExportPDF = async () => {
    if (!analytics) {
      console.warn("Tried to generate PDF report without analytics");
      return;
    }
    try {
      const filename = `provider-health-report-${new Date().toISOString().split('T')[0]}.html`;
      await generatePDFReport(providers, analytics, filename);
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
  const applyAdvancedFilters = (providers: ProviderHealth[]) => {
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

      // Risk level filter
      if (selectedRiskLevels.length > 0 && !selectedRiskLevels.includes(provider.riskLevel)) {
        return false;
      }

      // Status filter
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(provider.status)) {
        return false;
      }

      // Incident types filter
      if (selectedIncidentTypes.length > 0) {
        const hasMatchingIncident = selectedIncidentTypes.some(type => {
          switch (type) {
            case 'unresolved': return provider.unresolvedIncidents > 0;
            case 'recent': return provider.recentIncidents > 0;
            case 'none': return provider.totalIncidents === 0;
            default: return false;
          }
        });
        if (!hasMatchingIncident) return false;
      }

      // Date range filters
      if (dateRange.start && new Date(provider.createdAt) < new Date(dateRange.start)) {
        return false;
      }
      if (dateRange.end && new Date(provider.createdAt) > new Date(dateRange.end)) {
        return false;
      }

      // Activity date range (mock implementation)
      if (activityDateRange.start || activityDateRange.end) {
        // In a real implementation, you'd check lastActivity date
        // For now, we'll skip this filter
      }

      // Numeric range filters
      if (completionRateRange.min && provider.completionRate < parseFloat(completionRateRange.min)) {
        return false;
      }
      if (completionRateRange.max && provider.completionRate > parseFloat(completionRateRange.max)) {
        return false;
      }

      if (trustScoreRange.min && provider.trustScore < parseInt(trustScoreRange.min)) {
        return false;
      }
      if (trustScoreRange.max && provider.trustScore > parseInt(trustScoreRange.max)) {
        return false;
      }

      if (bookingCountRange.min && provider.totalBookings < parseInt(bookingCountRange.min)) {
        return false;
      }
      if (bookingCountRange.max && provider.totalBookings > parseInt(bookingCountRange.max)) {
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
        selectedRiskLevels,
        selectedStatuses,
        selectedIncidentTypes,
        dateRange,
        activityDateRange,
        completionRateRange,
        trustScoreRange,
        bookingCountRange
      },
      createdAt: new Date().toISOString()
    };

    const existingPresets = JSON.parse(localStorage.getItem('filterPresets') || '[]');
    existingPresets.push(preset);
    localStorage.setItem('filterPresets', JSON.stringify(existingPresets));
    setSavedFilters(existingPresets);
    setFilterName('');
    alert('Filter preset saved successfully!');
  };

  const loadFilterPreset = (preset: FilterPreset) => {
    setSearchQuery(preset.filters.searchQuery || '');
    setSelectedRiskLevels(preset.filters.selectedRiskLevels || []);
    setSelectedStatuses(preset.filters.selectedStatuses || []);
    setSelectedIncidentTypes(preset.filters.selectedIncidentTypes || []);
    setDateRange(preset.filters.dateRange || { start: '', end: '' });
    setActivityDateRange(preset.filters.activityDateRange || { start: '', end: '' });
    setCompletionRateRange(preset.filters.completionRateRange || { min: '', max: '' });
    setTrustScoreRange(preset.filters.trustScoreRange || { min: '', max: '' });
    setBookingCountRange(preset.filters.bookingCountRange || { min: '', max: '' });
    setShowAdvancedFilters(true);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedRiskLevels([]);
    setSelectedStatuses([]);
    setSelectedIncidentTypes([]);
    setDateRange({ start: '', end: '' });
    setActivityDateRange({ start: '', end: '' });
    setCompletionRateRange({ min: '', max: '' });
    setTrustScoreRange({ min: '', max: '' });
    setBookingCountRange({ min: '', max: '' });
  };

  // Load saved filters on component mount
  useEffect(() => {
    const presets = JSON.parse(localStorage.getItem('filterPresets') || '[]');
    setSavedFilters(presets);
  }, []);

  // Initialize sample notifications for demo
  useEffect(() => {
    const sampleNotifications: NotificationItem[] = [
      {
        id: 'sample-1',
        type: 'warning',
        title: 'High Risk Provider Alert',
        message: 'Provider "John\'s Cleaning Service" has exceeded risk threshold with 3 unresolved incidents.',
        timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        read: false,
        actionUrl: '/dashboard/admin/providers/provider-123',
        actionText: 'Review Provider'
      },
      {
        id: 'sample-2',
        type: 'info',
        title: 'Scheduled Report Generated',
        message: 'Weekly provider health summary report has been generated and sent to admin@company.com',
        timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
        read: true
      },
      {
        id: 'sample-3',
        type: 'error',
        title: 'Critical System Alert',
        message: 'Multiple providers have reported payment processing issues in the last hour.',
        timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        read: false,
        actionUrl: '/dashboard/admin/payments',
        actionText: 'Check Payments'
      }
    ];
    setNotifications(sampleNotifications);
  }, []);

  // Real-time updates
  const { isConnected, lastUpdate, isRetrying } = useRealTimeUpdates(
    {
      enabled: autoRefreshEnabled,
      updateInterval: refreshInterval,
    },
    (update) => {
      // Handle real-time updates
      if (update.type === 'alert' || update.type === 'incident') {
        const data = update.data as ProviderHealthNotificationPayload;
        const notification: NotificationItem = {
          id: update.id,
          type: update.type === 'alert' ? 'warning' : 'error',
          title: update.type === 'alert' ? 'New Alert' : 'New Incident',
          message: data.message || 'A new issue requires attention',
          timestamp: update.timestamp,
          read: false,
          actionUrl: data.actionUrl,
          actionText: 'View Details'
        };
        setNotifications(prev => [notification, ...prev.slice(0, 49)]); // Keep last 50
      }

      // Trigger data refresh for provider updates
      if (update.type === 'provider_update') {
        fetchProviders();
      }
    }
  );

  // Polling for periodic data refresh
  const { } = usePollingUpdates(
    async () => {
      await fetchProviders();
      return providers;
    },
    refreshInterval,
    autoRefreshEnabled
  );

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

  const handleRiskFilterChange = (newRisk: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("risk", newRisk);
    router.push(`?${params.toString()}`);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", newStatus);
    router.push(`?${params.toString()}`);
  };

  const handleIncidentsFilterChange = (newIncidents: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("incidents", newIncidents);
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
    return <div className="p-6">Loading...</div>;
  }

  // Apply advanced filters to providers
  const filteredProviders = applyAdvancedFilters(providers);

  // Calculate summary stats
  const totalProviders = filteredProviders.length;
  const criticalRisk = filteredProviders.filter(p => p.riskLevel === "critical").length;
  const highRisk = filteredProviders.filter(p => p.riskLevel === "high").length;
  const unresolvedIncidents = filteredProviders.reduce((sum, p) => sum + p.unresolvedIncidents, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Provider Health Dashboard v2</h1>
          <p className="text-gray-600">
            Comprehensive provider performance monitoring and risk assessment.
          </p>
        </div>
        <div className="flex gap-4 items-center">
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
          <a
            href="/dashboard/admin/trust/rules"
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            Risk Rules
          </a>
        </div>
      </div>

      {/* Risk Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalProviders}</div>
              <div className="text-sm text-gray-600">Total Providers</div>
            </div>
            <div className="text-green-500">📊</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-red-600">{criticalRisk}</div>
              <div className="text-sm text-gray-600">Critical Risk</div>
            </div>
            <div className="text-red-500">🚨</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-orange-600">{highRisk}</div>
              <div className="text-sm text-gray-600">High Risk</div>
            </div>
            <div className="text-orange-500">⚠️</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-blue-600">{unresolvedIncidents}</div>
              <div className="text-sm text-gray-600">Unresolved Incidents</div>
            </div>
            <div className="text-blue-500">📋</div>
          </div>
        </div>
      </div>

      {/* Recent Incidents Summary */}
      {providers.some(p => p.recentIncidents > 0) && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Trust Incidents (Last 30 Days)</h3>
          <div className="space-y-2">
            {providers
              .filter(p => p.recentIncidents > 0)
              .sort((a, b) => b.recentIncidents - a.recentIncidents)
              .slice(0, 5)
              .map(provider => (
                <div key={provider.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <span className="font-medium">{provider.businessName}</span>
                    <span className="text-sm text-gray-500 ml-2">@{provider.handle}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-red-600 font-medium">
                      {provider.recentIncidents} recent incidents
                    </span>
                    <a
                      href={`/dashboard/admin/trust?search=${encodeURIComponent(provider.businessName)}`}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      View →
                    </a>
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-3 text-right">
            <a
              href="/dashboard/admin/trust"
              className="text-blue-600 hover:text-blue-900 text-sm font-medium"
            >
              View All Trust Incidents →
            </a>
          </div>
        </div>
      )}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
            >
              <option value="risk">Risk Score</option>
              <option value="bookings">Total Bookings</option>
              <option value="cancellations">Cancellations</option>
              <option value="reviews">Reviews</option>
              <option value="trust">Trust Score</option>
              <option value="created">Newest</option>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={riskFilter}
              onChange={(e) => handleRiskFilterChange(e.target.value)}
            >
              <option value="all">All Risks</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Incidents</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={incidentsFilter}
              onChange={(e) => handleIncidentsFilterChange(e.target.value)}
            >
              <option value="all">All</option>
              <option value="unresolved">Has Unresolved</option>
              <option value="recent">Recent (30d)</option>
              <option value="none">No Incidents</option>
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
              {/* Risk Levels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Risk Levels</label>
                <div className="space-y-1">
                  {['low', 'medium', 'high', 'critical'].map(level => (
                    <label key={level} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedRiskLevels.includes(level)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRiskLevels(prev => [...prev, level]);
                          } else {
                            setSelectedRiskLevels(prev => prev.filter(l => l !== level));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm capitalize">{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div className="space-y-1">
                  {['approved', 'pending', 'suspended', 'rejected'].map(status => (
                    <label key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(status)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStatuses(prev => [...prev, status]);
                          } else {
                            setSelectedStatuses(prev => prev.filter(s => s !== status));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm capitalize">{status}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Incident Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Incident Types</label>
                <div className="space-y-1">
                  {[
                    { value: 'unresolved', label: 'Has Unresolved' },
                    { value: 'recent', label: 'Recent (30d)' },
                    { value: 'none', label: 'No Incidents' }
                  ].map(type => (
                    <label key={type.value} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedIncidentTypes.includes(type.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIncidentTypes(prev => [...prev, type.value]);
                          } else {
                            setSelectedIncidentTypes(prev => prev.filter(t => t !== type.value));
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Activity Date Range</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={activityDateRange.start}
                    onChange={(e) => setActivityDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="date"
                    value={activityDateRange.end}
                    onChange={(e) => setActivityDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Numeric Range Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Completion Rate (%)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    max="100"
                    value={completionRateRange.min}
                    onChange={(e) => setCompletionRateRange(prev => ({ ...prev, min: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    max="100"
                    value={completionRateRange.max}
                    onChange={(e) => setCompletionRateRange(prev => ({ ...prev, max: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trust Score</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    max="100"
                    value={trustScoreRange.min}
                    onChange={(e) => setTrustScoreRange(prev => ({ ...prev, min: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    max="100"
                    value={trustScoreRange.max}
                    onChange={(e) => setTrustScoreRange(prev => ({ ...prev, max: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Bookings</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    value={bookingCountRange.min}
                    onChange={(e) => setBookingCountRange(prev => ({ ...prev, min: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    value={bookingCountRange.max}
                    onChange={(e) => setBookingCountRange(prev => ({ ...prev, max: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Risk Score</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    value={riskScoreRange.min}
                    onChange={(e) => setRiskScoreRange(prev => ({ ...prev, min: e.target.value }))}
                    className="flex-1 border px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    value={riskScoreRange.max}
                    onChange={(e) => setRiskScoreRange(prev => ({ ...prev, max: e.target.value }))}
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

      {/* Performance Analytics Section */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Analytics</h3>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {analytics?.platformAverages.avgCompletionRate.toFixed(1) || 0}%
            </div>
            <div className="text-sm text-gray-600">Avg Completion Rate</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {analytics?.platformAverages.totalBookings || 0}
            </div>
            <div className="text-sm text-gray-600">Total Bookings</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {analytics?.platformAverages.avgCancellationRate.toFixed(1) || 0}%
            </div>
            <div className="text-sm text-gray-600">Avg Cancellation Rate</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {analytics?.platformAverages.highTrustProviders || 0}
            </div>
            <div className="text-sm text-gray-600">High Trust Providers</div>
          </div>
        </div>

        {/* Performance Trends Chart */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Booking Completion Trends (Last 90 Days)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Completion Rate Trend</h5>
              <LineChart
                data={[
                  { name: 'Day 1', value: 85 },
                  { name: 'Day 15', value: 87 },
                  { name: 'Day 30', value: 82 },
                  { name: 'Day 45', value: 89 },
                  { name: 'Day 60', value: 91 },
                  { name: 'Day 75', value: 88 },
                  { name: 'Day 90', value: 92 }
                ]}
                width={300}
                height={150}
                color="#10B981"
              />
            </div>
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Booking Volume Trend</h5>
              <AreaChart
                data={[
                  { name: 'Day 1', value: 45 },
                  { name: 'Day 15', value: 52 },
                  { name: 'Day 30', value: 48 },
                  { name: 'Day 45', value: 61 },
                  { name: 'Day 60', value: 55 },
                  { name: 'Day 75', value: 58 },
                  { name: 'Day 90', value: 63 }
                ]}
                width={300}
                height={150}
                color="#3B82F6"
                fillColor="#3B82F620"
              />
            </div>
          </div>
        </div>

        {/* Analytics & Trends */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Analytics & Trends</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Booking Volume Trends (Last 90 Days)</h5>
              <AreaChart
                data={Array.from({ length: 90 }, (_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (89 - i));
                  const bookings = Math.floor(Math.random() * 50) + 20; // Mock data
                  return {
                    name: date.toISOString().split('T')[0],
                    value: bookings
                  };
                })}
                width={400}
                height={200}
                color="#3B82F6"
              />
            </div>
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Provider Performance Distribution</h5>
              <BarChart
                data={[
                  { name: 'Excellent (95-100%)', value: providers.filter(p => p.completionRate >= 95).length, color: '#10B981' },
                  { name: 'Good (85-94%)', value: providers.filter(p => p.completionRate >= 85 && p.completionRate < 95).length, color: '#3B82F6' },
                  { name: 'Average (70-84%)', value: providers.filter(p => p.completionRate >= 70 && p.completionRate < 85).length, color: '#F59E0B' },
                  { name: 'Poor (<70%)', value: providers.filter(p => p.completionRate < 70).length, color: '#EF4444' }
                ]}
                width={400}
                height={200}
              />
            </div>
          </div>

          {/* Key Metrics Summary */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-lg font-semibold text-blue-900 mb-1">Total Bookings</div>
              <div className="text-3xl font-bold text-blue-600">
                {providers.reduce((sum, p) => sum + p.totalBookings, 0).toLocaleString()}
              </div>
              <div className="text-sm text-blue-700 mt-1">Last 30 days</div>
            </div>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-lg font-semibold text-green-900 mb-1">Avg Completion Rate</div>
              <div className="text-3xl font-bold text-green-600">
                {Math.round(providers.reduce((sum, p) => sum + p.completionRate, 0) / providers.length)}%
              </div>
              <div className="text-sm text-green-700 mt-1">Across all providers</div>
            </div>
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="text-lg font-semibold text-purple-900 mb-1">Active Providers</div>
              <div className="text-3xl font-bold text-purple-600">
                {providers.filter(p => p.status === 'active').length}
              </div>
              <div className="text-sm text-purple-700 mt-1">Currently active</div>
            </div>
          </div>
        </div>

        {/* Comparative Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Top Performers</h4>
            <div className="space-y-2">
              {providers
                .filter(p => p.totalBookings > 0)
                .sort((a, b) => b.completionRate - a.completionRate)
                .slice(0, 5)
                .map((provider, index) => (
                  <div key={provider.id} className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-800">#{index + 1}</span>
                      <span className="text-sm">{provider.businessName}</span>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      {provider.completionRate.toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Needs Improvement</h4>
            <div className="space-y-2">
              {providers
                .filter(p => p.totalBookings > 0)
                .sort((a, b) => a.completionRate - b.completionRate)
                .slice(0, 5)
                .map((provider, index) => (
                  <div key={provider.id} className="flex justify-between items-center p-2 bg-red-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-red-800">#{index + 1}</span>
                      <span className="text-sm">{provider.businessName}</span>
                    </div>
                    <span className="text-sm font-medium text-red-600">
                      {provider.completionRate.toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Seasonal Patterns & Response Time Analysis */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Activity Patterns</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">Peak Hours</span>
                <span className="text-sm font-medium">{analytics?.activityPatterns.peakHours || "2-6 PM"}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">Busiest Days</span>
                <span className="text-sm font-medium">{analytics?.activityPatterns.busiestDays || "Wed, Thu, Fri"}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">Avg Response Time</span>
                <span className="text-sm font-medium">{analytics?.activityPatterns.avgResponseTime || 2.3} hours</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Growth Trajectory</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">30-Day Growth</span>
                <span className="text-sm font-medium text-green-600">
                  +{analytics?.growthMetrics.avgBookingGrowth.toFixed(1) || 12}%
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">90-Day Growth</span>
                <span className="text-sm font-medium text-green-600">
                  +{analytics?.growthMetrics.avgCompletionGrowth.toFixed(1) || 28}%
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">New Providers</span>
                <span className="text-sm font-medium">{analytics?.growthMetrics.newProviders30d || 15} this month</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Lifecycle Management */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Provider Lifecycle Management</h3>

        {/* Lifecycle Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-indigo-50 rounded-lg">
            <div className="text-2xl font-bold text-indigo-600">
              {providers.filter(p => p.daysActive <= 30).length}
            </div>
            <div className="text-sm text-gray-600">New Providers (30d)</div>
          </div>
          <div className="text-center p-4 bg-teal-50 rounded-lg">
            <div className="text-2xl font-bold text-teal-600">
              {providers.filter(p => p.daysActive > 90 && p.daysActive <= 365).length}
            </div>
            <div className="text-sm text-gray-600">Established (3-12 months)</div>
          </div>
          <div className="text-center p-4 bg-emerald-50 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">
              {providers.filter(p => p.daysActive > 365).length}
            </div>
            <div className="text-sm text-gray-600">Veteran Providers (1+ years)</div>
          </div>
        </div>

        {/* Onboarding Status */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Onboarding Completion Status</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Profile Complete</span>
                <span className="text-green-600 font-bold">
                  {providers.filter(p => p.businessName && p.handle).length}/{providers.length}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: `${(providers.filter(p => p.businessName && p.handle).length / providers.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Services Added</span>
                <span className="text-blue-600 font-bold">
                  {providers.filter(p => p.totalBookings > 0).length}/{providers.length}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${(providers.filter(p => p.totalBookings > 0).length / providers.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Reviews Received</span>
                <span className="text-purple-600 font-bold">
                  {providers.filter(p => p.totalReviews > 0).length}/{providers.length}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full"
                  style={{ width: `${(providers.filter(p => p.totalReviews > 0).length / providers.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Trust Score ≥80</span>
                <span className="text-emerald-600 font-bold">
                  {providers.filter(p => p.trustScore >= 80).length}/{providers.length}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-emerald-600 h-2 rounded-full"
                  style={{ width: `${(providers.filter(p => p.trustScore >= 80).length / providers.length) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Tenure Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Tenure Distribution</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">0-30 days</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{providers.filter(p => p.daysActive <= 30).length}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(providers.filter(p => p.daysActive <= 30).length / providers.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">31-90 days</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{providers.filter(p => p.daysActive > 30 && p.daysActive <= 90).length}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${(providers.filter(p => p.daysActive > 30 && p.daysActive <= 90).length / providers.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">3-6 months</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{providers.filter(p => p.daysActive > 90 && p.daysActive <= 180).length}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-600 h-2 rounded-full"
                      style={{ width: `${(providers.filter(p => p.daysActive > 90 && p.daysActive <= 180).length / providers.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="text-sm">6+ months</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{providers.filter(p => p.daysActive > 180).length}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full"
                      style={{ width: `${(providers.filter(p => p.daysActive > 180).length / providers.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3">Growth Trajectory</h4>
            <div className="space-y-3">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Early Stage Growth</span>
                  <span className="text-green-600 font-bold">
                    {providers.filter(p => p.daysActive <= 90 && p.totalBookings > 5).length}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  Providers gaining traction within first 3 months
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Consistent Performers</span>
                  <span className="text-blue-600 font-bold">
                    {providers.filter(p => p.daysActive > 90 && p.completionRate > 85).length}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  Established providers with high completion rates
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">At Risk</span>
                  <span className="text-orange-600 font-bold">
                    {providers.filter(p => p.daysActive > 30 && p.totalBookings < 3).length}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  Providers showing low activity after initial period
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Onboardings */}
        <div className="mt-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Recent Onboardings (Last 30 Days)</h4>
          <div className="space-y-2">
            {providers
              .filter(p => p.daysActive <= 30)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, 5)
              .map(provider => (
                <div key={provider.id} className="flex justify-between items-center p-3 bg-blue-50 rounded">
                  <div>
                    <span className="font-medium">{provider.businessName}</span>
                    <span className="text-sm text-gray-500 ml-2">@{provider.handle}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {provider.daysActive} days active
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-blue-600 font-medium">
                      {provider.totalBookings} bookings
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      provider.trustScore >= 80 ? 'bg-green-100 text-green-800' :
                      provider.trustScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      Trust: {provider.trustScore}
                    </span>
                  </div>
                </div>
              ))}
          </div>
          {providers.filter(p => p.daysActive <= 30).length === 0 && (
            <p className="text-gray-500 text-center py-4">No recent onboardings</p>
          )}
        </div>
      </div>

      {/* Risk Management Tools */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Risk Management Tools</h3>

        {/* Alert Configuration */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Alert Configuration</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Critical Risk Threshold</span>
                <span className="text-red-600 font-bold">≥80</span>
              </div>
              <div className="text-xs text-gray-600">
                Immediate escalation required
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">High Risk Threshold</span>
                <span className="text-orange-600 font-bold">60-79</span>
              </div>
              <div className="text-xs text-gray-600">
                Enhanced monitoring needed
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Medium Risk Threshold</span>
                <span className="text-yellow-600 font-bold">40-59</span>
              </div>
              <div className="text-xs text-gray-600">
                Regular monitoring required
              </div>
            </div>
          </div>
        </div>

        {/* Active Alerts */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Active Alerts</h4>
          <div className="space-y-3">
            {providers
              .filter(p => p.alerts.length > 0)
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
                    {provider.alerts.map((alert, index) => (
                      <div key={index} className="text-sm text-red-800 flex items-center gap-2">
                        <span className="text-red-600">⚠️</span>
                        {alert}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
                      Escalate
                    </button>
                    <button className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
                      Review
                    </button>
                    <a
                      href={`/dashboard/admin/providers/${provider.id}`}
                      className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                    >
                      View Details
                    </a>
                  </div>
                </div>
              ))}
            {providers.filter(p => p.alerts.length > 0).length === 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <span className="text-green-800">✅ No active alerts</span>
              </div>
            )}
          </div>
        </div>

        {/* Escalation Workflows */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Escalation Workflows</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-600 text-lg">🚨</span>
                <span className="font-medium text-red-900">Critical Escalation</span>
              </div>
              <div className="text-xs text-red-800 space-y-1">
                <div>• Immediate suspension review</div>
                <div>• Customer notification</div>
                <div>• Legal team involvement</div>
                <div>• 24h response time</div>
              </div>
            </div>
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-orange-600 text-lg">⚠️</span>
                <span className="font-medium text-orange-900">High Risk Monitoring</span>
              </div>
              <div className="text-xs text-orange-800 space-y-1">
                <div>• Daily performance review</div>
                <div>• Enhanced incident tracking</div>
                <div>• Provider communication</div>
                <div>• 72h response time</div>
              </div>
            </div>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-yellow-600 text-lg">📊</span>
                <span className="font-medium text-yellow-900">Medium Risk Tracking</span>
              </div>
              <div className="text-xs text-yellow-800 space-y-1">
                <div>• Weekly performance check</div>
                <div>• Trend analysis</div>
                <div>• Support recommendations</div>
                <div>• 1 week response time</div>
              </div>
            </div>
          </div>
        </div>

        {/* Automated Recommendations */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Automated Recommendations</h4>
          <div className="space-y-3">
            {providers
              .filter(p => p.recommendations.length > 0)
              .slice(0, 5)
              .map(provider => (
                <div key={provider.id} className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium text-blue-900">{provider.businessName}</span>
                      <span className="text-sm text-blue-700 ml-2">@{provider.handle}</span>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {provider.recommendations.length} recommendations
                    </span>
                  </div>
                  <div className="space-y-1">
                    {provider.recommendations.slice(0, 2).map((rec, index) => (
                      <div key={index} className="text-sm text-blue-800 flex items-center gap-2">
                        <span className="text-blue-600">💡</span>
                        {rec}
                      </div>
                    ))}
                    {provider.recommendations.length > 2 && (
                      <div className="text-xs text-blue-600">
                        +{provider.recommendations.length - 2} more recommendations
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
                      Apply All
                    </button>
                    <button className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700">
                      Review
                    </button>
                  </div>
                </div>
              ))}
            {providers.filter(p => p.recommendations.length > 0).length === 0 && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                <span className="text-gray-600">No automated recommendations at this time</span>
              </div>
            )}
          </div>
        </div>

        {/* Proactive Monitoring */}
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-3">Risk Distribution & Monitoring</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Risk Level Distribution</h5>
              <PieChart
                data={[
                  { name: 'Low Risk', value: providers.filter(p => p.riskLevel === 'low').length, color: '#10B981' },
                  { name: 'Medium Risk', value: providers.filter(p => p.riskLevel === 'medium').length, color: '#F59E0B' },
                  { name: 'High Risk', value: providers.filter(p => p.riskLevel === 'high').length, color: '#F97316' },
                  { name: 'Critical Risk', value: providers.filter(p => p.riskLevel === 'critical').length, color: '#EF4444' }
                ]}
                width={250}
                height={250}
              />
            </div>
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Provider Lifecycle Stages</h5>
              <BarChart
                data={[
                  { name: 'New (0-30d)', value: providers.filter(p => p.daysActive <= 30).length, color: '#3B82F6' },
                  { name: 'Growing (31-90d)', value: providers.filter(p => p.daysActive > 30 && p.daysActive <= 90).length, color: '#8B5CF6' },
                  { name: 'Established (3-6m)', value: providers.filter(p => p.daysActive > 90 && p.daysActive <= 180).length, color: '#10B981' },
                  { name: 'Veteran (6m+)', value: providers.filter(p => p.daysActive > 180).length, color: '#F59E0B' }
                ]}
                width={300}
                height={200}
              />
            </div>
          </div>

          {/* Monitoring Frequency Summary */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600 mb-1">
                {providers.filter(p => p.riskLevel === 'low').length}
              </div>
              <div className="text-sm text-green-800">Low Risk - Stable</div>
              <div className="text-xs text-green-600 mt-1">Monthly monitoring</div>
            </div>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-600 mb-1">
                {providers.filter(p => p.riskLevel === 'medium').length}
              </div>
              <div className="text-sm text-yellow-800">Medium Risk - Watch</div>
              <div className="text-xs text-yellow-600 mt-1">Weekly monitoring</div>
            </div>
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-orange-600 mb-1">
                {providers.filter(p => p.riskLevel === 'high').length}
              </div>
              <div className="text-sm text-orange-800">High Risk - Monitor</div>
              <div className="text-xs text-orange-600 mt-1">Daily monitoring</div>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600 mb-1">
                {providers.filter(p => p.riskLevel === 'critical').length}
              </div>
              <div className="text-sm text-red-800">Critical Risk - Action</div>
              <div className="text-xs text-red-600 mt-1">Immediate action</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Incidents Summary */}
      {providers.some(p => p.recentIncidents > 0) && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Trust Incidents (Last 30 Days)</h3>
          <div className="space-y-2">
            {providers
              .filter(p => p.recentIncidents > 0)
              .sort((a, b) => b.recentIncidents - a.recentIncidents)
              .slice(0, 5)
              .map(provider => (
                <div key={provider.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <span className="font-medium">{provider.businessName}</span>
                    <span className="text-sm text-gray-500 ml-2">@{provider.handle}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-red-600 font-medium">
                      {provider.recentIncidents} recent incidents
                    </span>
                    <a
                      href={`/dashboard/admin/trust?search=${encodeURIComponent(provider.businessName)}`}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      View →
                    </a>
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-3 text-right">
            <a
              href="/dashboard/admin/trust"
              className="text-blue-600 hover:text-blue-900 text-sm font-medium"
            >
              View All Trust Incidents →
            </a>
          </div>
        </div>
      )}

      {/* Provider List */}
      {viewMode === "table" ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Incidents
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk Rules
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {providers.map((provider) => (
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
                        {provider.hasActiveSuspension && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Suspended
                          </span>
                        )}
                        {provider.hasUnresolvedIncidents && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            Incidents
                          </span>
                        )}
                      </div>
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
                    <div className="text-sm text-gray-900">
                      {provider.totalBookings} bookings
                    </div>
                    <div className="text-xs text-gray-500">
                      {provider.completionRate.toFixed(1)}% completion
                    </div>
                    <div className="text-xs text-gray-500">
                      {provider.cancellationRate.toFixed(1)}% cancellation
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {provider.totalIncidents} total
                    </div>
                    <div className="text-xs text-red-600">
                      {provider.unresolvedIncidents} unresolved
                    </div>
                    <div className="text-xs text-orange-600">
                      {provider.recentIncidents} recent
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{provider.trustScore}</div>
                    <div className="text-xs text-gray-500 capitalize">{provider.trustLevel}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {provider.applicableRiskRules.length > 0 ? (
                      <div className="space-y-1">
                        {provider.applicableRiskRules.slice(0, 2).map(rule => (
                          <div key={rule.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                            {rule.name} (-{rule.trustScorePenalty})
                            {rule.autoSuspend && " ⚠️"}
                          </div>
                        ))}
                        {provider.applicableRiskRules.length > 2 && (
                          <div className="text-xs text-gray-500">
                            +{provider.applicableRiskRules.length - 2} more
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">No rules apply</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex flex-col gap-1">
                      {/* Primary Actions Row */}
                      <div className="flex gap-1 flex-wrap">
                        <a
                          href={`/dashboard/admin/providers/${provider.id}`}
                          className="text-blue-600 hover:text-blue-900 text-xs bg-blue-50 px-2 py-1 rounded"
                          title="View detailed provider information"
                        >
                          👁️ Details
                        </a>
                        <button
                          className="text-orange-600 hover:text-orange-900 text-xs bg-orange-50 px-2 py-1 rounded"
                          title="Create new trust incident"
                          onClick={() => {/* TODO: Implement create incident modal */}}
                        >
                          🚨 Incident
                        </button>
                        <button
                          className={`text-xs px-2 py-1 rounded ${
                            provider.hasActiveSuspension
                              ? 'text-green-600 bg-green-50 hover:text-green-900'
                              : 'text-red-600 bg-red-50 hover:text-red-900'
                          }`}
                          title={provider.hasActiveSuspension ? "Unsuspend provider" : "Suspend provider"}
                          onClick={() => {/* TODO: Implement suspension toggle */}}
                        >
                          {provider.hasActiveSuspension ? '🔓 Unsuspend' : '🚫 Suspend'}
                        </button>
                      </div>

                      {/* Secondary Actions Row */}
                      <div className="flex gap-1 flex-wrap">
                        <button
                          className="text-purple-600 hover:text-purple-900 text-xs bg-purple-50 px-2 py-1 rounded"
                          title="Send notification to provider"
                          onClick={() => {/* TODO: Implement notification modal */}}
                        >
                          📧 Notify
                        </button>
                        <a
                          href={`/dashboard/admin/bookings?provider=${provider.id}`}
                          className="text-indigo-600 hover:text-indigo-900 text-xs bg-indigo-50 px-2 py-1 rounded"
                          title="View provider's booking history"
                        >
                          📅 Bookings ({provider.totalBookings})
                        </a>
                        {provider.totalDisputes > 0 && (
                          <a
                            href={`/dashboard/admin/disputes?provider=${provider.id}`}
                            className="text-red-600 hover:text-red-900 text-xs bg-red-50 px-2 py-1 rounded"
                            title="View provider's disputes"
                          >
                            ⚖️ Disputes ({provider.totalDisputes})
                          </a>
                        )}
                      </div>

                      {/* Status Indicators */}
                      <div className="flex gap-1 mt-1">
                        {provider.alerts.length > 0 && (
                          <span className="text-red-600 text-xs bg-red-100 px-1 py-0.5 rounded" title={provider.alerts.join(', ')}>
                            ⚠️ {provider.alerts.length} alerts
                          </span>
                        )}
                        {provider.recommendations.length > 0 && (
                          <span className="text-blue-600 text-xs bg-blue-100 px-1 py-0.5 rounded" title={provider.recommendations.join(', ')}>
                            💡 {provider.recommendations.length} recs
                          </span>
                        )}
                        {provider.applicableRiskRules.length > 0 && (
                          <span className="text-orange-600 text-xs bg-orange-100 px-1 py-0.5 rounded">
                            ⚡ {provider.applicableRiskRules.length} rules
                          </span>
                        )}
                      </div>
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
          {providers.map((provider) => (
            <div key={provider.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-300 hover:shadow-md transition-shadow">
              {/* Risk indicator border */}
              <div className={`border-l-4 ${
                provider.riskLevel === "critical" ? "border-red-500" :
                provider.riskLevel === "high" ? "border-orange-500" :
                provider.riskLevel === "medium" ? "border-yellow-500" :
                "border-green-500"
              }`} style={{marginLeft: '-4px'}}></div>

              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-medium text-gray-900">{provider.businessName}</h3>
                  <p className="text-sm text-gray-500">@{provider.handle}</p>
                </div>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  provider.riskLevel === "critical" ? "bg-red-100 text-red-800" :
                  provider.riskLevel === "high" ? "bg-orange-100 text-orange-800" :
                  provider.riskLevel === "medium" ? "bg-yellow-100 text-yellow-800" :
                  "bg-green-100 text-green-800"
                }`}>
                  {provider.riskLevel}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Risk Score:</span>
                  <span className="font-medium">{provider.riskScore}</span>
                </div>
                <div className="flex justify-between">
                  <span>Trust Score:</span>
                  <span>{provider.trustScore}</span>
                </div>
                <div className="flex justify-between">
                  <span>Completion:</span>
                  <span>{provider.completionRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Unresolved Incidents:</span>
                  <span className={provider.unresolvedIncidents > 0 ? "text-red-600 font-medium" : ""}>
                    {provider.unresolvedIncidents}
                  </span>
                </div>
                {provider.applicableRiskRules.length > 0 && (
                  <div className="flex justify-between">
                    <span>Active Rules:</span>
                    <span className="text-red-600 font-medium">
                      {provider.applicableRiskRules.length}
                    </span>
                  </div>
                )}
              </div>

              {provider.alerts.length > 0 && (
                <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-800">
                  {provider.alerts[0]}
                </div>
              )}

              <div className="mt-3 space-y-2">
                {/* Primary Actions */}
                <div className="flex flex-wrap gap-1">
                  <a
                    href={`/dashboard/admin/providers/${provider.id}`}
                    className="text-blue-600 hover:text-blue-900 text-xs bg-blue-50 px-2 py-1 rounded"
                  >
                    👁️ Details
                  </a>
                  <button
                    className="text-orange-600 hover:text-orange-900 text-xs bg-orange-50 px-2 py-1 rounded"
                    onClick={() => {/* TODO: Implement create incident modal */}}
                  >
                    🚨 Incident
                  </button>
                  <button
                    className={`text-xs px-2 py-1 rounded ${
                      provider.hasActiveSuspension
                        ? 'text-green-600 bg-green-50 hover:text-green-900'
                        : 'text-red-600 bg-red-50 hover:text-red-900'
                    }`}
                    onClick={() => {/* TODO: Implement suspension toggle */}}
                  >
                    {provider.hasActiveSuspension ? '🔓 Unsuspend' : '🚫 Suspend'}
                  </button>
                  <button
                    className="text-purple-600 hover:text-purple-900 text-xs bg-purple-50 px-2 py-1 rounded"
                    onClick={() => {/* TODO: Implement notification modal */}}
                  >
                    📧 Notify
                  </button>
                </div>

                {/* Secondary Actions */}
                <div className="flex flex-wrap gap-1">
                  <a
                    href={`/dashboard/admin/bookings?provider=${provider.id}`}
                    className="text-indigo-600 hover:text-indigo-900 text-xs bg-indigo-50 px-2 py-1 rounded"
                  >
                    📅 Bookings ({provider.totalBookings})
                  </a>
                  {provider.totalDisputes > 0 && (
                    <a
                      href={`/dashboard/admin/disputes?provider=${provider.id}`}
                      className="text-red-600 hover:text-red-900 text-xs bg-red-50 px-2 py-1 rounded"
                    >
                      ⚖️ Disputes ({provider.totalDisputes})
                    </a>
                  )}
                  {provider.unresolvedIncidents > 0 && (
                    <a
                      href={`/dashboard/admin/trust?search=${encodeURIComponent(provider.businessName)}`}
                      className="text-orange-600 hover:text-orange-900 text-xs bg-orange-50 px-2 py-1 rounded"
                    >
                      🚨 Incidents ({provider.unresolvedIncidents})
                    </a>
                  )}
                </div>

                {/* Status Indicators */}
                <div className="flex flex-wrap gap-1">
                  {provider.alerts.length > 0 && (
                    <span className="text-red-600 text-xs bg-red-100 px-2 py-1 rounded">
                      ⚠️ {provider.alerts.length} alerts
                    </span>
                  )}
                  {provider.recommendations.length > 0 && (
                    <span className="text-blue-600 text-xs bg-blue-100 px-2 py-1 rounded">
                      💡 {provider.recommendations.length} recs
                    </span>
                  )}
                  {provider.applicableRiskRules.length > 0 && (
                    <span className="text-orange-600 text-xs bg-orange-100 px-2 py-1 rounded">
                      ⚡ {provider.applicableRiskRules.length} rules
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {providers.length === 0 && (
        <p className="text-gray-500 text-center py-8">No providers found matching the current filters.</p>
      )}

      {/* Scheduled Reports Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Schedule Automated Reports</h3>

            <ScheduledReportsModal
              onSchedule={handleScheduleReport}
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
