'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, CheckCircle, AlertTriangle } from 'lucide-react';

interface ImageUploaderProps {
  serviceId: string;
  onUploadComplete: (publicUrl: string) => void;
}

type UploadState = 'idle' | 'validating' | 'uploading' | 'saving' | 'success' | 'error';

export function ImageUploader({ serviceId, onUploadComplete }: ImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // 1. Client-side Validation
    setStatus('validating');
    if (!selectedFile.type.startsWith('image/')) {
      setStatus('error');
      setMessage('Invalid file type. Please select an image.');
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) { // 5MB limit
      setStatus('error');
      setMessage('File size exceeds 5MB limit.');
      return;
    }

    setFile(selectedFile);
    setStatus('idle');
    setMessage(selectedFile.name);
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus('error');
      setMessage('Please select a file first.');
      return;
    }

    try {
      // Step 1: Get Pre-Signed URL
      setStatus('uploading');
      setMessage('Preparing upload...');
      const presignResponse = await fetch('/api/uploads/presign-service-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: serviceId,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!presignResponse.ok) {
        throw new Error(await presignResponse.text());
      }

      const { uploadUrl, publicUrl } = await presignResponse.json();

      // Step 2: Upload File to R2
      setMessage('Uploading image...');
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to R2.');
      }

      // Step 3: Update Service in our DB
      setStatus('saving');
      setMessage('Saving to service...');
      const updateResponse = await fetch('/api/services/update-cover', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: serviceId,
          publicUrl: publicUrl,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error(await updateResponse.text());
      }

      // All done!
      setStatus('success');
      setMessage('Upload complete!');
      onUploadComplete(publicUrl);

    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'An unknown error occurred.');
    }
  };

  const isLoading = status === 'uploading' || status === 'saving' || status === 'validating';

  return (
    <div className="space-y-4">
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="picture">Service Cover Image</Label>
        <Input id="picture" type="file" accept="image/*" onChange={handleFileChange} />
      </div>

      <Button onClick={handleUpload} disabled={!file || isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {status === 'idle' && 'Upload Image'}
        {status === 'validating' && 'Validating...'}
        {status === 'uploading' && 'Uploading...'}
        {status === 'saving' && 'Saving...'}
        {status === 'success' && 'Done!'}
        {status === 'error' && 'Retry Upload'}
      </Button>

      {message && (
        <div
          className={`text-sm flex items-center ${
            status === 'error' ? 'text-destructive' :
            status === 'success' ? 'text-green-600' :
            'text-muted-foreground'
          }`}
        >
          {status === 'success' && <CheckCircle className="h-4 w-4 mr-2" />}
          {status === 'error' && <AlertTriangle className="h-4 w-4 mr-2" />}
          <p>{message}</p>
        </div>
      )}
    </div>
  );
}

