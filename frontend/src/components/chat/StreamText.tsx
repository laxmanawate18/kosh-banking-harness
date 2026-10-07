import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type HNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HNode[] };

// Same look as common/MarkdownRenderer (its classes), so a reply never changes appearance when it finishes streaming.
const CLASS: Record<string, string> = {
  p: 'mdr-p', strong: 'mdr-strong', em: 'mdr-em', ul: 'mdr-list', ol: 'mdr-list', li: 'mdr-li',
  h1: 'mdr-h1', h2: 'mdr-h2', h3: 'mdr-h3', blockquote: 'mdr-quote', code: 'mdr-code', a: 'mdr-a',
};

/** rehype step: MarkdownRenderer's classes, safe links, and every sentence in its own span so each fades in once on arrival. */
const sentenceSpans = () => (tree: HNode) => {
  const walk = (node: HNode) => {
    const tag = node.tagName || '';
    if (CLASS[tag]) node.properties = { ...node.properties, className: [CLASS[tag]] };
    if (tag === 'a') node.properties = { ...node.properties, target: '_blank', rel: 'noopener noreferrer' };
    if (tag === 'code' || tag === 'pre') return;
    node.children = node.children?.flatMap(child => {
      if (child.type !== 'text' || !child.value?.trim()) { walk(child); return [child]; }  // whitespace between list items stays
      return (child.value!.match(/[^]*?(?:[.!?।]\s+|$)/g) || []).filter(Boolean).map(value =>
        ({ type: 'element', tagName: 'span', properties: { className: ['c-sent'] }, children: [{ type: 'text', value }] }));
    });
  };
  walk(tree);
};

/** While streaming, only whole sentences are shown, so text arrives a sentence at a time instead of word by word. */
const settled = (text: string) => {
  let end = 0;
  for (const m of text.matchAll(/(?<!\d)[.!?।]["')*\]]*\s|\n/g)) end = m.index + m[0].length;
  return text.slice(0, end);
};

/** Mitra's reply as Markdown; each sentence fades in as it lands (CSS, off under reduced motion). */
export const StreamText: React.FC<{ text: string; streaming?: boolean }> = ({ text, streaming }) => {
  const content = streaming ? settled(text) : text;
  if (!content) return null;
  return (
    <div className="markdown-content c-stream">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[sentenceSpans]}>{content}</ReactMarkdown>
    </div>
  );
};
