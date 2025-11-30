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
import { format } from 'date-fns';
import { Send, MessageSquare, Clock, Users, Search, Mail, Bell } from 'lucide-react';

interface Provider {
  id: string;
  businessName: string;
  handle: string;
  email: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'approved' | 'pending' | 'suspended' | 'rejected';
  totalBookings: number;
  trustScore: number;
  lastActivity: Date;
}

interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'general' | 'risk' | 'compliance' | 'promotion' | 'support';
  variables: string[];
}

interface CommunicationHistory {
  id: string;
  providerId: string;
  providerName: string;
  type: 'email' | 'notification' | 'sms';
  subject: string;
  message: string;
  sentAt: Date;
  status: 'sent' | 'delivered' | 'failed' | 'read';
  response?: string;
  responseAt?: Date;
}

interface BulkMessageData {
  subject: string;
  message: string;
  type: 'email' | 'notification' | 'sms';
  providerIds: string[];
  scheduledFor?: Date;
  templateId?: string;
}

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
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRiskLevel, setFilterRiskLevel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('compose');

  // Mock data for demonstration
  useEffect(() => {
    // Load providers
    const mockProviders: Provider[] = [
      {
        id: '1',
        businessName: 'Elite Cleaning Services',
        handle: 'eliteclean',
        email: 'contact@eliteclean.com',
        riskLevel: 'low',
        status: 'approved',
        totalBookings: 45,
        trustScore: 92,
        lastActivity: new Date('2025-11-25')
      },
      {
        id: '2',
        businessName: 'Quick Fix Plumbing',
        handle: 'quickfix',
        email: 'info@quickfixplumbing.com',
        riskLevel: 'medium',
        status: 'approved',
        totalBookings: 23,
        trustScore: 78,
        lastActivity: new Date('2025-11-20')
      },
      {
        id: '3',
        businessName: 'Premium Landscaping',
        handle: 'premiumscape',
        email: 'hello@premiumlandscaping.com',
        riskLevel: 'high',
        status: 'suspended',
        totalBookings: 12,
        trustScore: 45,
        lastActivity: new Date('2025-11-15')
      }
    ];
    setProviders(mockProviders);

    // Load message templates
    const mockTemplates: MessageTemplate[] = [
      {
        id: '1',
        name: 'Risk Alert - High Risk',
        subject: 'Important: Risk Assessment Update',
        body: 'Dear {provider_name},\n\nWe have identified some concerns with your account that require immediate attention. Your current risk level is {risk_level}.\n\nPlease review and address the following issues:\n{issues}\n\nContact support if you need assistance.\n\nBest regards,\nVerial Services Team',
        category: 'risk',
        variables: ['provider_name', 'risk_level', 'issues']
      },
      {
        id: '2',
        name: 'Account Suspension Notice',
        subject: 'Account Suspension - Action Required',
        body: 'Dear {provider_name},\n\nYour account has been temporarily suspended due to {reason}.\n\nTo restore your account, please:\n1. Address the issues mentioned\n2. Contact our support team\n3. Complete any required verifications\n\nWe appreciate your cooperation.\n\nBest regards,\nVerial Services Team',
        category: 'compliance',
        variables: ['provider_name', 'reason']
      },
      {
        id: '3',
        name: 'Performance Improvement',
        subject: 'Tips to Improve Your Performance',
        body: 'Dear {provider_name},\n\nWe noticed some areas where you can improve your service quality:\n\n{improvement_tips}\n\nImplementing these changes will help you:\n- Increase booking rates\n- Improve customer satisfaction\n- Boost your trust score\n\nContact us if you need help getting started.\n\nBest regards,\nVerial Services Team',
        category: 'support',
        variables: ['provider_name', 'improvement_tips']
      }
    ];
    setTemplates(mockTemplates);

    // Load communication history
    const mockHistory: CommunicationHistory[] = [
      {
        id: '1',
        providerId: '1',
        providerName: 'Elite Cleaning Services',
        type: 'email',
        subject: 'Monthly Performance Review',
        message: 'Your performance this month has been excellent...',
        sentAt: new Date('2025-11-20'),
        status: 'read'
      },
      {
        id: '2',
        providerId: '2',
        providerName: 'Quick Fix Plumbing',
        type: 'notification',
        subject: 'Risk Level Update',
        message: 'Your risk level has been updated to medium...',
        sentAt: new Date('2025-11-18'),
        status: 'delivered'
      }
    ];
    setCommunicationHistory(mockHistory);
  }, []);

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
      alert('Please fill in all required fields and select at least one provider.');
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      const newMessage: BulkMessageData = {
        ...messageData,
        providerIds: selectedProviders,
        scheduledFor: scheduledDate
      };

      console.log('Sending bulk message:', newMessage);

      // Reset form
      setMessageData({
        subject: '',
        message: '',
        type: 'notification',
        providerIds: []
      });
      setSelectedProviders([]);
      setScheduledDate(undefined);

      alert(`Message sent successfully to ${selectedProviders.length} provider(s)!`);
    } catch {
      alert('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      case 'rejected': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Provider Communication Tools</h2>
          <p className="text-gray-600">Send bulk messages and manage provider communications</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {providers.length} Total Providers
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {communicationHistory.length} Messages Sent
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
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Search providers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
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
                  {filteredProviders.map(provider => (
                    <div key={provider.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                      <Checkbox
                        id={`provider-${provider.id}`}
                        checked={selectedProviders.includes(provider.id)}
                        onCheckedChange={(checked) => handleProviderSelect(provider.id, checked as boolean)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{provider.businessName}</span>
                          <Badge className={getRiskBadgeColor(provider.riskLevel)}>
                            {provider.riskLevel}
                          </Badge>
                          <Badge className={getStatusBadgeColor(provider.status)}>
                            {provider.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500">
                          @{provider.handle} • {provider.totalBookings} bookings • Trust: {provider.trustScore}
                        </div>
                      </div>
                    </div>
                  ))}
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
                    onValueChange={(value: 'email' | 'notification' | 'sms') =>
                      setMessageData(prev => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="notification">📱 In-App Notification</SelectItem>
                      <SelectItem value="email">📧 Email</SelectItem>
                      <SelectItem value="sms">💬 SMS</SelectItem>
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
                {communicationHistory.map(message => (
                  <div key={message.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium">{message.providerName}</span>
                        <span className="text-sm text-gray-500 ml-2">({message.type})</span>
                      </div>
                      <Badge variant={message.status === 'read' ? 'default' : 'secondary'}>
                        {message.status}
                      </Badge>
                    </div>
                    <h4 className="font-medium mb-1">{message.subject}</h4>
                    <p className="text-sm text-gray-600 mb-2">{message.message.substring(0, 100)}...</p>
                    <div className="text-xs text-gray-500">
                      Sent {format(message.sentAt, 'PPP p')}
                      {message.response && (
                        <span className="ml-4 text-green-600">
                          Response received {format(message.responseAt!, 'PPP p')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
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
                {templates.map(template => (
                  <div key={template.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">{template.name}</h4>
                      <Badge variant="outline">{template.category}</Badge>
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">{template.subject}</p>
                    <p className="text-sm text-gray-600 mb-2">
                      {template.body.substring(0, 100)}...
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {template.variables.map(variable => (
                        <Badge key={variable} variant="secondary" className="text-xs">
                          {variable}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProviderCommunicationTools;