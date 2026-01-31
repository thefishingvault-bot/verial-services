'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Ignore clipboard failures (e.g. older browsers / permissions)
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleCopy} disabled={copied}>
      {copied ? 'Copied' : 'Copy email'}
    </Button>
  );
}
