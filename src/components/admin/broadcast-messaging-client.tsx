'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Send, Users, Eye, TrendingUp } from 'lucide-react';

interface BroadcastStats {
  totalBroadcasts: number;
  totalNotificationsSent: number;
  totalRead: number;
  avgReadRate: number;
}

interface BroadcastTrend {
  date: string;
  messagesSent: number;
  messagesRead: number;
  readRate: number;
}

interface UserSegment {
  role: string[];
  count: number;
}

interface Broadcast {
  id: string;
  message: string;
  createdAt: string;
  totalSent: number;
  totalRead: number;
}

interface BroadcastData {
  broadcasts: Broadcast[];
  stats: BroadcastStats;
  trends: BroadcastTrend[];
  userSegments: UserSegment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export default function BroadcastMessagingClient() {
  const [data, setData] = useState<BroadcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [href, setHref] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchBroadcastData();
  }, []);

  const fetchBroadcastData = async () => {
    try {
      const response = await fetch('/api/admin/broadcast');
      if (response.ok) {
        const broadcastData = await response.json();
        setData(broadcastData);
      }
    } catch (error) {
      console.error('Error fetching broadcast data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!message.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a message',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);

    try {
      const response = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          href: href || '/dashboard',
          targetRoles: selectedRoles.length > 0 ? selectedRoles : null,
          targetUsers: selectedUsers.length > 0 ? selectedUsers : null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Success',
          description: result.message,
        });
        setMessage('');
        setHref('');
        setSelectedRoles([]);
        setSelectedUsers([]);
        // Refresh data to show updated stats
        fetchBroadcastData();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to send broadcast',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Network error occurred',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleRoleToggle = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading broadcast messaging data...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="compose" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="compose">Compose Message</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="history">Message History</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Broadcast Message
              </CardTitle>
              <CardDescription>
                Compose and send a message to users across the platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message">Message Content *</Label>
                <Textarea
                  id="message"
                  placeholder="Enter your broadcast message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="href">Link URL (optional)</Label>
                <Input
                  id="href"
                  placeholder="/dashboard or https://example.com"
                  value={href}
                  onChange={(e) => setHref(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label>Target Audience</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">By Role</h4>
                    {data?.userSegments.map((segment) => (
                      <div key={segment.role.join(',')} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${segment.role.join(',')}`}
                          checked={selectedRoles.includes(segment.role.join(','))}
                          onCheckedChange={() => handleRoleToggle(segment.role.join(','))}
                        />
                        <Label htmlFor={`role-${segment.role.join(',')}`} className="text-sm">
                          {segment.role.join(', ')} ({segment.count} users)
                        </Label>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Quick Options</h4>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="all-users"
                        checked={selectedRoles.length === 0 && selectedUsers.length === 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRoles([]);
                            setSelectedUsers([]);
                          }
                        }}
                      />
                      <Label htmlFor="all-users" className="text-sm">
                        All Users ({data?.userSegments.reduce((sum, seg) => sum + seg.count, 0)})
                      </Label>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSendBroadcast}
                disabled={sending || !message.trim()}
                className="w-full"
              >
                {sending ? 'Sending...' : 'Send Broadcast'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Broadcasts</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.stats.totalBroadcasts || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.stats.totalNotificationsSent || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Messages Read</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.stats.totalRead || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Read Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(data?.stats.avgReadRate || 0).toFixed(1)}%</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>30-Day Broadcast Trends</CardTitle>
              <CardDescription>Message delivery and engagement over the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.trends.map((trend) => (
                  <div key={trend.date} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div>
                        <p className="font-medium">{new Date(trend.date).toLocaleDateString()}</p>
                        <p className="text-sm text-muted-foreground">
                          {trend.messagesSent} sent • {trend.messagesRead} read
                        </p>
                      </div>
                    </div>
                    <Badge variant={trend.readRate > 50 ? 'default' : 'secondary'}>
                      {trend.readRate.toFixed(1)}% read rate
                    </Badge>
                  </div>
                ))}
                {(!data?.trends || data.trends.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    No broadcast data available for the last 30 days
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Broadcast Messages</CardTitle>
              <CardDescription>History of sent broadcast messages</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Message</TableHead>
                    <TableHead>Sent At</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Read Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.broadcasts.map((broadcast) => (
                    <TableRow key={broadcast.id}>
                      <TableCell className="max-w-xs truncate">{broadcast.message}</TableCell>
                      <TableCell>{new Date(broadcast.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{broadcast.totalSent}</TableCell>
                      <TableCell>
                        {broadcast.totalSent > 0
                          ? `${((broadcast.totalRead / broadcast.totalSent) * 100).toFixed(1)}%`
                          : '0%'
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!data?.broadcasts || data.broadcasts.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No broadcast messages sent yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}