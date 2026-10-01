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
          p: ({ children }) => <p className="mdr-p">{children}</p>,
          strong: ({ children }) => <strong className="mdr-strong">{children}</strong>,
          em: ({ children }) => <em className="mdr-em">{children}</em>,
          ul: ({ children }) => <ul className="mdr-list">{children}</ul>,
          ol: ({ children }) => <ol className="mdr-list">{children}</ol>,
          li: ({ children }) => <li className="mdr-li">{children}</li>,
          h1: ({ children }) => <h1 className="mdr-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="mdr-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="mdr-h3">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="mdr-quote">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="mdr-code">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mdr-a"
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
