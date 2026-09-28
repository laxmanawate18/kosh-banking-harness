import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0 leading-normal">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-4 my-1 first:mt-0 last:mb-0 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 my-1 first:mt-0 last:mb-0 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5 leading-snug">{children}</li>,
          h1: ({ children }) => <h1 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xs font-bold mt-2 mb-1 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-bold uppercase tracking-wider mt-1.5 mb-0.5 first:mt-0">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--accent)] pl-3 py-0.5 my-1.5 italic opacity-90">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded text-[11px] font-mono font-medium">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--brand)] underline underline-offset-2 hover:opacity-80 font-medium"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
