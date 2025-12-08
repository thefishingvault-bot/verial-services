import { db } from '@/lib/db';
import { providerNotes } from '@/db/schema';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const { providerId } = await params;
    const { note } = await request.json();

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json({ error: 'Note is required' }, { status: 400 });
    }

    if (note.length > 1000) {
      return NextResponse.json({ error: 'Note must be less than 1000 characters' }, { status: 400 });
    }

    // Insert the note
    const noteId = `pnote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const [newNote] = await db
      .insert(providerNotes)
      .values({
        id: noteId,
        providerId,
        note: note.trim(),
        createdBy: userId,
        isInternal: true,
      })
      .returning();

    return NextResponse.json({ success: true, note: newNote });
  } catch (error) {
    console.error('Error adding provider note:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}