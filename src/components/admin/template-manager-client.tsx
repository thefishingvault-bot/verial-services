'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Edit, Trash2, Search, FileText, BarChart3 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface Template {
  id: string;
  name: string;
  category: string;
  subject: string;
  content: string;
  variables: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateStats {
  total: number;
  byCategory: Record<string, number>;
}

interface TemplateData {
  templates: Template[];
  stats: TemplateStats;
}

const TEMPLATE_CATEGORIES = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'provider', label: 'Provider' },
  { value: 'payments', label: 'Payments' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'marketing', label: 'Marketing' },
];

export default function TemplateManagerClient() {
  const [data, setData] = useState<TemplateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subject: '',
    content: '',
    variables: [] as string[],
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/admin/templates?${params}`);
      if (response.ok) {
        const templateData = await response.json();
        setData(templateData);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [selectedCategory, searchTerm]);

  const handleCreateTemplate = async () => {
    if (!formData.name || !formData.category || !formData.subject || !formData.content) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Template created successfully',
        });
        setIsCreateDialogOpen(false);
        resetForm();
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to create template',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Network error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    try {
      const response = await fetch('/api/admin/templates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingTemplate.id,
          ...formData,
        }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Template updated successfully',
        });
        setEditingTemplate(null);
        resetForm();
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to update template',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Network error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const response = await fetch(`/api/admin/templates?id=${templateId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Template deleted successfully',
        });
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete template',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Network error occurred',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      subject: '',
      content: '',
      variables: [],
    });
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      subject: template.subject,
      content: template.content,
      variables: template.variables,
    });
  };

  const addVariable = () => {
    setFormData(prev => ({
      ...prev,
      variables: [...prev.variables, ''],
    }));
  };

  const updateVariable = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      variables: prev.variables.map((v, i) => i === index ? value : v),
    }));
  };

  const removeVariable = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variables: prev.variables.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return <div className="text-center py-8">Loading template manager...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {TEMPLATE_CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Template</DialogTitle>
                  <DialogDescription>
                    Create a new message template for broadcasts and notifications.
                  </DialogDescription>
                </DialogHeader>
                <TemplateForm
                  formData={formData}
                  setFormData={setFormData}
                  onAddVariable={addVariable}
                  onUpdateVariable={updateVariable}
                  onRemoveVariable={removeVariable}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateTemplate}>Create Template</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {data?.templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {template.name}
                        <Badge variant="secondary">{template.category}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {template.subject}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {template.createdBy !== 'system' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Template</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete &ldquo;{template.name}&rdquo;? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteTemplate(template.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{template.content}</p>
                  {template.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground mr-2">Variables:</span>
                      {template.variables.map((variable) => (
                        <Badge key={variable} variant="outline" className="text-xs">
                          {`{${variable}}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-3">
                    Updated {new Date(template.updatedAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!data?.templates || data.templates.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                No templates found. Create your first template to get started.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.stats.total || 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Templates by Category</CardTitle>
              <CardDescription>Distribution of templates across different categories</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(data?.stats.byCategory || {}).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">
                        {TEMPLATE_CATEGORIES.find(c => c.value === category)?.label || category}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{count} templates</span>
                    </div>
                    <div className="w-24 bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{
                          width: `${((count as number) / (data?.stats.total || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Update the template details and content.
            </DialogDescription>
          </DialogHeader>
          <TemplateForm
            formData={formData}
            setFormData={setFormData}
            onAddVariable={addVariable}
            onUpdateVariable={updateVariable}
            onRemoveVariable={removeVariable}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTemplate}>Update Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TemplateFormProps {
  formData: {
    name: string;
    category: string;
    subject: string;
    content: string;
    variables: string[];
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    category: string;
    subject: string;
    content: string;
    variables: string[];
  }>>;
  onAddVariable: () => void;
  onUpdateVariable: (index: number, value: string) => void;
  onRemoveVariable: (index: number) => void;
}

function TemplateForm({ formData, setFormData, onAddVariable, onUpdateVariable, onRemoveVariable }: TemplateFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Template Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Welcome Message"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_CATEGORIES.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Subject Line *</Label>
        <Input
          id="subject"
          value={formData.subject}
          onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
          placeholder="e.g., Welcome to our platform!"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Message Content *</Label>
        <Textarea
          id="content"
          value={formData.content}
          onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
          placeholder="Enter the message content. Use {variableName} for dynamic content."
          rows={6}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Variables</Label>
          <Button type="button" variant="outline" size="sm" onClick={onAddVariable}>
            <Plus className="h-4 w-4 mr-1" />
            Add Variable
          </Button>
        </div>
        <div className="space-y-2">
          {formData.variables.map((variable, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={variable}
                onChange={(e) => onUpdateVariable(index, e.target.value)}
                placeholder="variableName"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRemoveVariable(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Variables can be used in the content with curly braces, e.g., &#123;firstName&#125;
        </p>
      </div>
    </div>
  );
}