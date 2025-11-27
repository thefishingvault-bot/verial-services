import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// In-memory storage for templates (in production, this would be a database table)
let messageTemplates: any[] = [
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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]?.role?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]?.role?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, category, subject, content, variables } = body;

    if (!name || !category || !subject || !content) {
      return NextResponse.json(
        { error: 'Name, category, subject, and content are required' },
        { status: 400 }
      );
    }

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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]?.role?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, category, subject, content, variables } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]?.role?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

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