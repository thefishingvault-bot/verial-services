import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { messageTemplates } from '@/db/schema';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { ensureUserExistsInDb } from '@/lib/user-sync';
import { writeAdminAuditLog } from '@/lib/admin-audit';
import {
  TemplatesQuerySchema,
  TemplateCreateSchema,
  TemplateUpdateSchema,
  TemplateDeleteSchema,
  invalidResponse,
  parseBody,
  parseQuery,
} from '@/lib/validation/admin';

function makeTemplateId() {
  return `mtmpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(TemplatesQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { category, search } = parsedQuery.data;

    const whereClauses = [] as Array<ReturnType<typeof and>>;

    if (category && category !== 'all') {
      whereClauses.push(and(eq(messageTemplates.category, category)));
    }

    if (search) {
      const like = `%${search}%`;
      whereClauses.push(
        and(
          sql`(
            ${messageTemplates.name} ILIKE ${like}
            OR ${messageTemplates.subject} ILIKE ${like}
            OR ${messageTemplates.body} ILIKE ${like}
          )`,
        ),
      );
    }

    const where = whereClauses.length
      ? and(...whereClauses.map((c) => c).filter(Boolean))
      : undefined;

    const [rows, totalRes, byCategoryRes] = await Promise.all([
      db
        .select({
          id: messageTemplates.id,
          name: messageTemplates.name,
          category: messageTemplates.category,
          subject: messageTemplates.subject,
          content: messageTemplates.body,
          variables: messageTemplates.variables,
          createdBy: messageTemplates.createdBy,
          createdAt: messageTemplates.createdAt,
          updatedAt: messageTemplates.updatedAt,
        })
        .from(messageTemplates)
        .where(where)
        .orderBy(desc(messageTemplates.updatedAt)),
      db.select({ count: sql<number>`COUNT(*)` }).from(messageTemplates),
      db
        .select({ category: messageTemplates.category, count: sql<number>`COUNT(*)` })
        .from(messageTemplates)
        .groupBy(messageTemplates.category),
    ]);

    const byCategory = byCategoryRes.reduce(
      (acc, row) => {
        acc[row.category] = Number(row.count ?? 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    return NextResponse.json({
      templates: rows.map((t) => ({
        ...t,
        variables: t.variables ?? [],
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
        updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
      })),
      stats: {
        total: Number(totalRes[0]?.count ?? 0),
        byCategory,
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

    await ensureUserExistsInDb(userId!, 'admin');

    const parsedBody = await parseBody(TemplateCreateSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);
    const { name, category, subject, content, variables } = parsedBody.data;

    const now = new Date();
    const id = makeTemplateId();

    await db.insert(messageTemplates).values({
      id,
      name: name.trim(),
      category: category.trim(),
      subject: subject.trim(),
      body: content.trim(),
      variables: (variables ?? []).length ? variables : null,
      createdBy: userId!,
      createdAt: now,
      updatedAt: now,
    });

    await writeAdminAuditLog({
      userId: userId!,
      action: 'TEMPLATE_CREATE',
      resource: 'template',
      resourceId: id,
      details: `Created template: ${name.trim()}`,
      request,
    });

    return NextResponse.json({
      success: true,
      template: {
        id,
        name: name.trim(),
        category: category.trim(),
        subject: subject.trim(),
        content: content.trim(),
        variables: variables ?? [],
        createdBy: userId!,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
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
    const { userId } = admin;

    await ensureUserExistsInDb(userId!, 'admin');

    const parsedBody = await parseBody(TemplateUpdateSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);
    const { id, name, category, subject, content, variables } = parsedBody.data;

    const existing = await db
      .select({
        id: messageTemplates.id,
        name: messageTemplates.name,
        category: messageTemplates.category,
        subject: messageTemplates.subject,
        body: messageTemplates.body,
        variables: messageTemplates.variables,
        createdBy: messageTemplates.createdBy,
        createdAt: messageTemplates.createdAt,
        updatedAt: messageTemplates.updatedAt,
      })
      .from(messageTemplates)
      .where(eq(messageTemplates.id, id))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const now = new Date();

    await db
      .update(messageTemplates)
      .set({
        name: name?.trim() ?? existing[0].name,
        category: category?.trim() ?? existing[0].category,
        subject: subject?.trim() ?? existing[0].subject,
        body: content?.trim() ?? existing[0].body,
        variables: variables ? (variables.length ? variables : null) : existing[0].variables,
        updatedAt: now,
      })
      .where(eq(messageTemplates.id, id));

    await writeAdminAuditLog({
      userId: userId!,
      action: 'TEMPLATE_UPDATE',
      resource: 'template',
      resourceId: id,
      details: `Updated template: ${name?.trim() ?? existing[0].name}`,
      request,
    });

    return NextResponse.json({
      success: true,
      template: {
        id,
        name: name?.trim() ?? existing[0].name,
        category: category?.trim() ?? existing[0].category,
        subject: subject?.trim() ?? existing[0].subject,
        content: content?.trim() ?? existing[0].body,
        variables: variables ?? (existing[0].variables ?? []),
        createdBy: existing[0].createdBy,
        createdAt: existing[0].createdAt instanceof Date ? existing[0].createdAt.toISOString() : String(existing[0].createdAt),
        updatedAt: now.toISOString(),
      },
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
    const { userId } = admin;

    await ensureUserExistsInDb(userId!, 'admin');

    const parsedQuery = parseQuery(TemplateDeleteSchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { id } = parsedQuery.data;

    const existing = await db
      .select({ id: messageTemplates.id, createdBy: messageTemplates.createdBy, name: messageTemplates.name })
      .from(messageTemplates)
      .where(eq(messageTemplates.id, id))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Don't allow deletion of system templates
    if (existing[0].createdBy === 'system') {
      return NextResponse.json(
        { error: 'Cannot delete system templates' },
        { status: 403 }
      );
    }

    await db.delete(messageTemplates).where(eq(messageTemplates.id, id));

    await writeAdminAuditLog({
      userId: userId!,
      action: 'TEMPLATE_DELETE',
      resource: 'template',
      resourceId: id,
      details: `Deleted template: ${existing[0].name}`,
      request,
    });

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