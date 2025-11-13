import { promises as fs } from 'fs';
import path from 'path';
import { MarkdownRenderer } from '@/components/legal/markdown-renderer';

async function getLegalContent(filename: string) {
  // Correct path is the root
  const filePath = path.join(process.cwd(), filename);
  const content = await fs.readFile(filePath, 'utf8');
  return content;
}

export default async function TermsPage() {
  const content = await getLegalContent('terms.md');

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Terms of Service</h2>
      <MarkdownRenderer content={content} />
    </div>
  );
}

