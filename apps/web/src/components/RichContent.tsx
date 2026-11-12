import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/format';

/**
 * Renders question content: Markdown (tables, lists), KaTeX math ($…$, $$…$$),
 * and images. Raw HTML is NOT rendered (XSS-safe by construction).
 */
export const RichContent = memo(function RichContent({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return (
    <div className={cn('prose-tech', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <figure className="my-3">
              <img src={src} alt={alt ?? ''} loading="lazy" className="mx-auto" />
              {alt && <figcaption className="mt-1 text-center text-xs text-muted">{alt}</figcaption>}
            </figure>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
