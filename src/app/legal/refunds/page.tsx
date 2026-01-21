import { promises as fs } from 'fs';
import path from 'path';
import { MarkdownRenderer } from '@/components/legal/markdown-renderer';

async function getLegalContent(filename: string) {
  const filePath = path.join(process.cwd(), filename);
  const content = await fs.readFile(filePath, 'utf8');
  return content;
}

export default async function RefundsPage() {
  const content = await getLegalContent('refund-dispute-policy.md');

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Refund Policy</h2>
      <MarkdownRenderer content={content} />
    </div>
  );
}
