'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus } from 'lucide-react';

interface AddProviderNoteProps {
  providerId: string;
  onNoteAdded?: () => void;
}

export function AddProviderNote({ providerId, onNoteAdded }: AddProviderNoteProps) {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!note.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/providers/${providerId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: note.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to add note');
      }

      setNote('');
      setIsExpanded(false);
      onNoteAdded?.();
      // Refresh the page to show the new note
      window.location.reload();
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add note. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => setIsExpanded(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Note
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Add Internal Note</CardTitle>
        <CardDescription className="text-xs">
          This note will only be visible to admins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Enter your internal note..."
            rows={3}
            maxLength={1000}
            className="text-sm"
            disabled={isSubmitting}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !note.trim()}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Note'
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setIsExpanded(false);
                setNote('');
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}