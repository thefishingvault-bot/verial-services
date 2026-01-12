type ProviderHealthData = {
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
  cancellationRate: number | null;
  completionRate: number | null;
  bookings30d: number;
  completed30d: number;
  cancelled30d: number;
  bookings90d: number;
  completed90d: number;
  cancelled90d: number;
  completionRate30d: number | null;
  cancellationRate30d: number | null;
  completionRate90d: number | null;
  cancellationRate90d: number | null;
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
  lastActivity?: Date;
};

export function exportToCSV(data: ProviderHealthData[], filename: string = 'provider-health-report.csv') {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Define CSV headers
  const headers = [
    'Business Name',
    'Handle',
    'Risk Level',
    'Risk Score',
    'Trust Score',
    'Completion Rate (%)',
    'Total Bookings',
    'Cancellation Rate (%)',
    'Total Reviews',
    'Average Rating',
    'Days Active',
    'Status',
    'Unresolved Incidents',
    'Recent Incidents (30d)',
    'Total Disputes',
    'Applied Risk Rules',
    'Alerts',
    'Recommendations',
    'Created Date',
    'Last Activity'
  ];

  // Convert data to CSV rows
  const rows = data.map(provider => [
    provider.businessName,
    provider.handle,
    provider.riskLevel,
    provider.riskScore,
    provider.trustScore,
    provider.completionRate === null ? 'N/A' : provider.completionRate.toFixed(2),
    provider.totalBookings,
    provider.cancellationRate === null ? 'N/A' : provider.cancellationRate.toFixed(2),
    provider.totalReviews,
    provider.avgRating?.toFixed(1) || 'N/A',
    provider.daysActive,
    provider.status,
    provider.unresolvedIncidents,
    provider.recentIncidents,
    provider.totalDisputes,
    provider.applicableRiskRules.length,
    provider.alerts.join('; '),
    provider.recommendations.join('; '),
    provider.createdAt.toLocaleDateString(),
    provider.lastActivity?.toLocaleDateString() || 'N/A'
  ]);

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(data: ProviderHealthData[], filename: string = 'provider-health-report.json') {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

type AnalyticsData = {
  platformAverages: {
    avgCompletionRate: number | null;
    avgCancellationRate: number | null;
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

export async function generatePDFReport(data: ProviderHealthData[], analytics: AnalyticsData, filename: string = 'provider-health-report.pdf') {
  // This would typically use a PDF generation library like jsPDF or Puppeteer
  // For now, we'll create a simple HTML-based PDF structure

  const completionRates = data
    .map((p) => p.completionRate)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const avgCompletionRateDisplay =
    completionRates.length === 0
      ? 'N/A'
      : `${(completionRates.reduce((sum, v) => sum + v, 0) / completionRates.length).toFixed(1)}%`;

  const reportHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Provider Health Report</title>
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
        <h1>Provider Health Report</h1>
        <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
      </div>

      <div class="summary">
        <div class="metric">
          <h3>Total Providers</h3>
          <div class="value">${data.length}</div>
        </div>
        <div class="metric">
          <h3>Critical Risk</h3>
          <div class="value">${data.filter(p => p.riskLevel === 'critical').length}</div>
        </div>
        <div class="metric">
          <h3>Avg Completion Rate</h3>
          <div class="value">${avgCompletionRateDisplay}</div>
        </div>
        <div class="metric">
          <h3>Active Providers</h3>
          <div class="value">${data.filter(p => p.status === 'active').length}</div>
        </div>
      </div>

      <h2>Provider Details</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Risk Level</th>
            <th>Risk Score</th>
            <th>Completion Rate</th>
            <th>Total Bookings</th>
            <th>Unresolved Incidents</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(provider => `
            <tr class="risk-${provider.riskLevel}">
              <td>${provider.businessName}<br><small>@${provider.handle}</small></td>
              <td>${provider.riskLevel.toUpperCase()}</td>
              <td>${provider.riskScore}</td>
              <td>${provider.completionRate === null ? 'N/A' : `${provider.completionRate.toFixed(1)}%`}</td>
              <td>${provider.totalBookings}</td>
              <td>${provider.unresolvedIncidents}</td>
              <td>${provider.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <p>This report was generated automatically by the Provider Health Monitoring System.</p>
        <p>For questions or concerns, please contact the platform administration team.</p>
      </div>
    </body>
    </html>
  `;

  // Create blob and download
  const blob = new Blob([reportHTML], { type: 'text/html;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename.replace('.pdf', '.html'));
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function scheduleReport(email: string, frequency: 'daily' | 'weekly' | 'monthly', reportType: 'summary' | 'detailed') {
  // This would typically make an API call to schedule automated reports
  // For now, we'll store in localStorage as a mock implementation
  const scheduledReports = JSON.parse(localStorage.getItem('scheduledReports') || '[]');

  const newReport = {
    id: Date.now().toString(),
    email,
    frequency,
    reportType,
    createdAt: new Date().toISOString(),
    active: true
  };

  scheduledReports.push(newReport);
  localStorage.setItem('scheduledReports', JSON.stringify(scheduledReports));

  return newReport;
}

export function getScheduledReports() {
  return JSON.parse(localStorage.getItem('scheduledReports') || '[]');
}

export function cancelScheduledReport(reportId: string) {
  const scheduledReports: Array<{
    id: string;
    email: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    reportType: 'summary' | 'detailed';
    active: boolean;
  }> = JSON.parse(localStorage.getItem('scheduledReports') || '[]');
  const updatedReports = scheduledReports.map((report) =>
    report.id === reportId ? { ...report, active: false } : report
  );
  localStorage.setItem('scheduledReports', JSON.stringify(updatedReports));
}