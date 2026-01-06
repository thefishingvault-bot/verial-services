"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { Send, MessageSquare, Clock, Users, Mail, Bell } from 'lucide-react';

interface Provider {
  id: string;
  businessName: string;
  handle: string;
  email: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'approved' | 'pending' | 'suspended' | 'rejected';
  totalBookings: number;
  trustScore: number;
  lastActivity: string | null;
}

interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  variables: string[] | null;
}

interface CommunicationHistory {
  id: string;
  providerId: string;
  providerName: string;
  providerHandle?: string;
  type: 'email' | 'notification';
  subject: string;
  message: string;
  sentAt: string;
  status: 'sent' | 'delivered' | 'failed' | 'read';
  error?: string | null;
  response?: string;
  responseAt?: string | null;
}

interface BulkMessageData {
  subject: string;
  message: string;
  type: 'email' | 'notification';
  providerIds: string[];
  scheduledFor?: Date;
  templateId?: string;
}

type ProvidersApiResponse = {
  providers: Provider[];
  totals: {
    totalProviders: number;
    totalMessagesSent: number;
  };
};

type TemplatesApiResponse = {
  templates: MessageTemplate[];
};

type HistoryApiResponse = {
  communications: CommunicationHistory[];
};

const ProviderCommunicationTools: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [messageData, setMessageData] = useState<BulkMessageData>({
    subject: '',
    message: '',
    type: 'notification',
    providerIds: []
  });
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [communicationHistory, setCommunicationHistory] = useState<CommunicationHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRiskLevel, setFilterRiskLevel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('compose');
  const [totals, setTotals] = useState<{ totalProviders: number; totalMessagesSent: number }>({
    totalProviders: 0,
    totalMessagesSent: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setInitialLoading(true);
      try {
        const [providersRes, templatesRes, historyRes] = await Promise.all([
          fetch(`/api/admin/provider-communications?kind=providers&q=${encodeURIComponent(searchQuery)}&risk=${encodeURIComponent(filterRiskLevel)}&status=${encodeURIComponent(filterStatus)}`),
          fetch('/api/admin/provider-communications?kind=templates'),
          fetch('/api/admin/provider-communications?kind=history&limit=20&page=1'),
        ]);

        if (!providersRes.ok) throw new Error('Failed to load providers');
        if (!templatesRes.ok) throw new Error('Failed to load templates');
        if (!historyRes.ok) throw new Error('Failed to load history');

        const providersJson = (await providersRes.json()) as ProvidersApiResponse;
        const templatesJson = (await templatesRes.json()) as TemplatesApiResponse;
        const historyJson = (await historyRes.json()) as HistoryApiResponse;

        if (cancelled) return;
        setProviders(providersJson.providers);
        setTotals(providersJson.totals);
        setTemplates(templatesJson.templates);
        setCommunicationHistory(historyJson.communications);
      } catch (e) {
        console.error(e);
        toast({
          title: 'Failed to load provider communications',
          description: e instanceof Error ? e.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Refresh providers list when filters change.
    let cancelled = false;
    const controller = new AbortController();

    async function refreshProviders() {
      try {
        const res = await fetch(
          `/api/admin/provider-communications?kind=providers&q=${encodeURIComponent(searchQuery)}&risk=${encodeURIComponent(filterRiskLevel)}&status=${encodeURIComponent(filterStatus)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const json = (await res.json()) as ProvidersApiResponse;
        if (cancelled) return;
        setProviders(json.providers);
        setTotals(json.totals);
        setSelectedProviders((prev) => prev.filter((id) => json.providers.some((p) => p.id === id)));
      } catch (e) {
        if (typeof e === "object" && e !== null && "name" in e && (e as { name?: unknown }).name === "AbortError") return;
        console.error(e);
      }
    }

    // Avoid spamming network on every keystroke.
    const t = setTimeout(refreshProviders, 250);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(t);
    };
  }, [filterRiskLevel, filterStatus, searchQuery]);

  const filteredProviders = providers.filter(provider => {
    const matchesSearch = provider.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         provider.handle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = filterRiskLevel === 'all' || provider.riskLevel === filterRiskLevel;
    const matchesStatus = filterStatus === 'all' || provider.status === filterStatus;
    return matchesSearch && matchesRisk && matchesStatus;
  });

  const handleProviderSelect = (providerId: string, checked: boolean) => {
    if (checked) {
      setSelectedProviders(prev => [...prev, providerId]);
    } else {
      setSelectedProviders(prev => prev.filter(id => id !== providerId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProviders(filteredProviders.map(p => p.id));
    } else {
      setSelectedProviders([]);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setMessageData(prev => ({
        ...prev,
        subject: template.subject,
        message: template.body,
        templateId: template.id
      }));
    }
  };

  const handleSendMessage = async () => {
    if (!messageData.subject || !messageData.message || selectedProviders.length === 0) {
      toast({
        title: 'Missing required fields',
        description: 'Enter a subject, message, and select at least one provider.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const newMessage: BulkMessageData = {
        ...messageData,
        providerIds: selectedProviders,
        scheduledFor: scheduledDate
      };

      const res = await fetch('/api/admin/provider-communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: newMessage.subject,
          message: newMessage.message,
          type: newMessage.type,
          providerIds: newMessage.providerIds,
          scheduledFor: newMessage.scheduledFor?.toISOString(),
          templateId: newMessage.templateId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ? String(err.error) : 'Failed to send message');
      }

      const json = await res.json().catch(() => null);

      // Reset form
      setMessageData({
        subject: '',
        message: '',
        type: 'notification',
        providerIds: []
      });
      setSelectedProviders([]);
      setScheduledDate(undefined);

      // Refresh history
      const historyRes = await fetch('/api/admin/provider-communications?kind=history&limit=20&page=1');
      if (historyRes.ok) {
        const historyJson = (await historyRes.json()) as HistoryApiResponse;
        setCommunicationHistory(historyJson.communications);
      }

      toast({
        title: json?.scheduled ? 'Message scheduled' : 'Message sent',
        description: json?.scheduled
          ? `Scheduled for ${scheduledDate ? format(scheduledDate, 'PPP') : 'later'}.`
          : `Sent to ${selectedProviders.length} provider(s).`,
      });
    } catch (e) {
      toast({
        title: 'Failed to send message',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskBadgeVariant = (riskLevel: string) => {
    if (riskLevel === 'critical' || riskLevel === 'high') return 'destructive' as const;
    if (riskLevel === 'medium') return 'secondary' as const;
    return 'outline' as const;
  };

  const getStatusBadgeVariant = (status: string) => {
    if (status === 'suspended') return 'destructive' as const;
    if (status === 'approved') return 'default' as const;
    if (status === 'pending') return 'secondary' as const;
    return 'outline' as const;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Provider Communication Tools</h2>
          <p className="text-muted-foreground">Send bulk messages and manage provider communications</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {totals.totalProviders} Total Providers
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {totals.totalMessagesSent} Messages Sent
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="compose">Compose Message</TabsTrigger>
          <TabsTrigger value="history">Communication History</TabsTrigger>
          <TabsTrigger value="templates">Message Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Provider Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Select Providers ({selectedProviders.length} selected)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search providers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={filterRiskLevel} onValueChange={setFilterRiskLevel}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Risk Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Risks</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Select All */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedProviders.length === filteredProviders.length && filteredProviders.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium">
                    Select All ({filteredProviders.length} providers)
                  </label>
                </div>

                {/* Provider List */}
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {initialLoading ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">Loading providers...</div>
                  ) : filteredProviders.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">No providers match these filters.</div>
                  ) : (
                    filteredProviders.map(provider => (
                      <div key={provider.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                        <Checkbox
                          id={`provider-${provider.id}`}
                          checked={selectedProviders.includes(provider.id)}
                          onCheckedChange={(checked: boolean | "indeterminate") => handleProviderSelect(provider.id, checked === true)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{provider.businessName}</span>
                            <Badge variant={getRiskBadgeVariant(provider.riskLevel)}>
                              {provider.riskLevel}
                            </Badge>
                            <Badge variant={getStatusBadgeVariant(provider.status)}>
                              {provider.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            @{provider.handle} • {provider.totalBookings} bookings • Trust: {provider.trustScore}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Message Composition */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Compose Message
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Message Type */}
                <div>
                  <label className="block text-sm font-medium mb-2">Message Type</label>
                  <Select
                    value={messageData.type}
                    onValueChange={(value: 'email' | 'notification') =>
                      setMessageData(prev => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="notification">In-App Notification</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">Use Template (Optional)</label>
                  <Select onValueChange={handleTemplateSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} ({template.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium mb-2">Subject</label>
                  <Input
                    placeholder="Enter message subject..."
                    value={messageData.subject}
                    onChange={(e) => setMessageData(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium mb-2">Message</label>
                  <Textarea
                    placeholder="Enter your message..."
                    value={messageData.message}
                    onChange={(e) => setMessageData(prev => ({ ...prev, message: e.target.value }))}
                    rows={8}
                  />
                </div>

                {/* Schedule Options */}
                <div className="flex items-center gap-4">
                  <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {scheduledDate ? format(scheduledDate, 'PPP') : 'Schedule for later'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Schedule Message</DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={setScheduledDate}
                          disabled={(date) => date < new Date()}
                          className="rounded-md border"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setScheduledDate(undefined)}>
                          Clear
                        </Button>
                        <Button onClick={() => setShowScheduleDialog(false)}>
                          Done
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || selectedProviders.length === 0}
                    className="flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {isLoading ? 'Sending...' : `Send to ${selectedProviders.length} Provider${selectedProviders.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Communication History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {initialLoading ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Loading history...</div>
                ) : communicationHistory.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">No communications yet.</div>
                ) : (
                  communicationHistory.map(message => (
                    <div key={message.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium">{message.providerName}</span>
                          {message.providerHandle ? (
                            <span className="text-sm text-muted-foreground ml-2">@{message.providerHandle}</span>
                          ) : null}
                          <span className="text-sm text-muted-foreground ml-2">({message.type})</span>
                        </div>
                        <Badge variant={message.status === 'failed' ? 'destructive' : message.status === 'read' ? 'default' : 'secondary'}>
                          {message.status}
                        </Badge>
                      </div>
                      <h4 className="font-medium mb-1">{message.subject}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{message.message.substring(0, 120)}{message.message.length > 120 ? '…' : ''}</p>
                      {message.status === 'failed' && message.error ? (
                        <p className="text-sm text-destructive mb-2">{message.error}</p>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        Sent {format(new Date(message.sentAt), 'PPP p')}
                        {message.response && message.responseAt ? (
                          <span className="ml-4">
                            Response received {format(new Date(message.responseAt), 'PPP p')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Message Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {initialLoading ? (
                  <div className="text-sm text-muted-foreground py-8 text-center col-span-full">Loading templates...</div>
                ) : templates.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center col-span-full">No templates found.</div>
                ) : (
                  templates.map(template => (
                    <div key={template.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium">{template.name}</h4>
                        <Badge variant="outline">{template.category}</Badge>
                      </div>
                      <p className="text-sm font-medium mb-1">{template.subject}</p>
                      <p className="text-sm text-muted-foreground mb-2">
                        {template.body.substring(0, 120)}{template.body.length > 120 ? '…' : ''}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(template.variables ?? []).map(variable => (
                          <Badge key={variable} variant="secondary" className="text-xs">
                            {variable}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProviderCommunicationTools;