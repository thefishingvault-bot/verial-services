import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  TemplatesQuerySchema,
  TemplateCreateSchema,
  TemplateUpdateSchema,
  TemplateDeleteSchema,
  invalidResponse,
  parseBody,
  parseQuery,
} from '@/lib/validation/admin';

// In-memory storage for templates (in production, this would be a database table)
interface MessageTemplate {
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

const messageTemplates: MessageTemplate[] = [
  {
    id: 'welcome_new_user',
    name: 'Welcome New User',
    category: 'onboarding',
    subject: 'Welcome to Verial Services!',
    content: 'Welcome to Verial Services! We\'re excited to have you join our community of trusted service providers and customers. Get started by exploring available services or registering as a provider.',
    variables: ['firstName'],
    createdBy: 'system',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'booking_confirmed',
    name: 'Booking Confirmed',
    category: 'bookings',
    subject: 'Your booking has been confirmed!',
    content: 'Great news! Your booking for {serviceName} with {providerName} has been confirmed. The service is scheduled for {scheduledDate}. You can view the details in your dashboard.',
    variables: ['serviceName', 'providerName', 'scheduledDate'],
    createdBy: 'system',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'provider_approved',
    name: 'Provider Approved',
    category: 'provider',
    subject: 'Your provider account has been approved!',
    content: 'Congratulations! Your provider account has been approved and is now live. You can start creating services and accepting bookings. Check out our provider dashboard to get started.',
    variables: ['businessName'],
    createdBy: 'system',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'payment_reminder',
    name: 'Payment Reminder',
    category: 'payments',
    subject: 'Payment reminder for your upcoming service',
    content: 'This is a friendly reminder that your service with {providerName} is coming up on {scheduledDate}. Please ensure your payment method is up to date.',
    variables: ['providerName', 'scheduledDate'],
    createdBy: 'system',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
];

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(TemplatesQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { category, search } = parsedQuery.data;

    let filteredTemplates = messageTemplates;

    if (category && category !== 'all') {
      filteredTemplates = filteredTemplates.filter(template => template.category === category);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredTemplates = filteredTemplates.filter(template =>
        template.name.toLowerCase().includes(searchLower) ||
        template.content.toLowerCase().includes(searchLower) ||
        template.subject.toLowerCase().includes(searchLower)
      );
    }

    // Group templates by category for analytics
    const categoryStats = messageTemplates.reduce((acc, template) => {
      acc[template.category] = (acc[template.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      templates: filteredTemplates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      stats: {
        total: messageTemplates.length,
        byCategory: categoryStats,
      },
    });
  } catch (error) {
    console.error('Error fetching message templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const parsedBody = await parseBody(TemplateCreateSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);
    const { name, category, subject, content, variables } = parsedBody.data;

    const newTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      category: category.trim(),
      subject: subject.trim(),
      content: content.trim(),
      variables: variables || [],
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    messageTemplates.push(newTemplate);

    return NextResponse.json({
      success: true,
      template: newTemplate,
    });
  } catch (error) {
    console.error('Error creating message template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedBody = await parseBody(TemplateUpdateSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);
    const { id, name, category, subject, content, variables } = parsedBody.data;

    const templateIndex = messageTemplates.findIndex(template => template.id === id);
    if (templateIndex === -1) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const updatedTemplate = {
      ...messageTemplates[templateIndex],
      name: name?.trim() || messageTemplates[templateIndex].name,
      category: category?.trim() || messageTemplates[templateIndex].category,
      subject: subject?.trim() || messageTemplates[templateIndex].subject,
      content: content?.trim() || messageTemplates[templateIndex].content,
      variables: variables || messageTemplates[templateIndex].variables,
      updatedAt: new Date().toISOString(),
    };

    messageTemplates[templateIndex] = updatedTemplate;

    return NextResponse.json({
      success: true,
      template: updatedTemplate,
    });
  } catch (error) {
    console.error('Error updating message template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(TemplateDeleteSchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { id } = parsedQuery.data;

    const templateIndex = messageTemplates.findIndex(template => template.id === id);
    if (templateIndex === -1) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Don't allow deletion of system templates
    if (messageTemplates[templateIndex].createdBy === 'system') {
      return NextResponse.json(
        { error: 'Cannot delete system templates' },
        { status: 403 }
      );
    }

    messageTemplates.splice(templateIndex, 1);

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting message template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}