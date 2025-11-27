'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Shield, Users, TrendingUp } from 'lucide-react';

interface TrustAnomaly {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'open' | 'resolved';
  createdAt: string;
  providerId: string | null;
  providerName: string | null;
  providerHandle: string | null;
}

interface Stats {
  totalIncidents: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  openIncidents: number;
  resolvedIncidents: number;
}

interface IncidentByType {
  type: string;
  count: number;
}

interface TopProvider {
  providerId: string | null;
  providerName: string | null;
  providerHandle: string | null;
  incidentCount: number;
}

interface TrustAnomaliesData {
  anomalies: TrustAnomaly[];
  stats: Stats;
  incidentsByType: IncidentByType[];
  topProviders: TopProvider[];
  timeframe: string;
  severity: string;
}

export function TrustAnomaliesClient() {
  const [data, setData] = useState<TrustAnomaliesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('30d');
  const [severity, setSeverity] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ timeframe, severity });
      const response = await fetch(`/api/admin/trust-anomalies?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching trust anomalies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeframe, severity]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'open' ? 'destructive' : 'secondary';
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!data) {
    return <div>Error loading data</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Timeframe</label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Severity</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Incidents</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.totalIncidents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Severity</CardTitle>
            <Shield className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{data.stats.highSeverity}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.openIncidents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.stats.resolvedIncidents}</div>
          </CardContent>
        </Card>
      </div>

      {/* Incidents by Type */}
      <Card>
        <CardHeader>
          <CardTitle>Incidents by Type</CardTitle>
          <CardDescription>Distribution of trust incidents by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.incidentsByType.map((item) => (
              <div key={item.type} className="flex justify-between items-center">
                <span className="capitalize">{item.type.replace('_', ' ')}</span>
                <Badge variant="outline">{item.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Providers */}
      <Card>
        <CardHeader>
          <CardTitle>Top Providers with Incidents</CardTitle>
          <CardDescription>Providers with the most trust incidents</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topProviders.map((provider) => (
                <TableRow key={provider.providerId}>
                  <TableCell>{provider.providerName || 'Unknown'}</TableCell>
                  <TableCell>@{provider.providerHandle}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">{provider.incidentCount}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Anomalies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trust Anomalies</CardTitle>
          <CardDescription>Detailed list of trust incidents and anomalies</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.anomalies.map((anomaly) => (
                <TableRow key={anomaly.id}>
                  <TableCell className="capitalize">
                    {anomaly.type.replace('_', ' ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSeverityColor(anomaly.severity)}>
                      {anomaly.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {anomaly.description}
                  </TableCell>
                  <TableCell>
                    {anomaly.providerName ? (
                      <div>
                        <div className="font-medium">{anomaly.providerName}</div>
                        <div className="text-sm text-muted-foreground">
                          @{anomaly.providerHandle}
                        </div>
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(anomaly.status)}>
                      {anomaly.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(anomaly.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}