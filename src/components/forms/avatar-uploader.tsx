'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface AvatarUploaderProps {
  onUploadComplete: (publicUrl: string) => void;
}

type UploadState = 'idle' | 'uploading' | 'error';

export function AvatarUploader({ onUploadComplete }: AvatarUploaderProps) {
  const [status, setStatus] = useState<UploadState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Client-side Validation
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid File Type',
        description: 'Please select an image.',
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      // 2MB limit
      toast({
        variant: 'destructive',
        title: 'File Too Large',
        description: 'Avatar must be smaller than 2MB.',
      });
      return;
    }

    setStatus('uploading');
    setMessage(null);

    try {
      // 2. Get Pre-Signed URL
      const presignResponse = await fetch('/api/uploads/presign-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileType: file.type, fileSize: file.size }),
      });

      if (!presignResponse.ok) {
        throw new Error(await presignResponse.text());
      }

      const { uploadUrl, publicUrl } = await presignResponse.json();

      // 3. Upload File to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to R2.');
      }

      // 4. All done! Notify parent
      onUploadComplete(publicUrl);
      setStatus('idle');
    } catch (err: unknown) {
      setStatus('error');
      const errorMessage =
        err instanceof Error ? err.message : 'An unknown error occurred.';
      setMessage(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Avatar upload failed',
        description: errorMessage,
      });
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Input
        id="avatar-upload"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={status === 'uploading'}
        className="max-w-xs"
      />
      {status === 'uploading' && <Loader2 className="h-5 w-5 animate-spin" />}
      {status === 'error' && (
        <span
          className="inline-flex"
          title={message || 'Error uploading avatar'}
        >
          <AlertTriangle
            className="h-5 w-5 text-destructive"
            aria-hidden="true"
          />
        </span>
      )}
    </div>
  );
}

