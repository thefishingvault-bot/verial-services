import { db } from '@/lib/db';
import { providerNotes } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const role = user.publicMetadata.role;

    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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