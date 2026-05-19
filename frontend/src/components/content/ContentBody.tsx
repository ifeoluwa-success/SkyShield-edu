import React from 'react';

interface ContentBodyProps {
  content: string;
  className?: string;
}

/** Renders markdown-ish operational content without extra dependencies. */
const ContentBody: React.FC<ContentBodyProps> = ({ content, className = '' }) => {
  if (!content?.trim()) {
    return <p className="content-body-empty">No briefing content available.</p>;
  }

  const blocks = content.split(/\n\n+/);

  return (
    <article className={`content-body ${className}`.trim()}>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('### ')) {
          return <h4 key={i} className="content-body-h4">{trimmed.slice(4)}</h4>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={i} className="content-body-h3">{trimmed.slice(3)}</h3>;
        }
        if (trimmed.startsWith('# ')) {
          return <h2 key={i} className="content-body-h2">{trimmed.slice(2)}</h2>;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const items = trimmed.split('\n').filter((l) => /^[-*]\s/.test(l));
          return (
            <ul key={i} className="content-body-ul">
              {items.map((line, j) => (
                <li key={j}>{line.replace(/^[-*]\s+/, '')}</li>
              ))}
            </ul>
          );
        }

        return <p key={i} className="content-body-p">{trimmed}</p>;
      })}
    </article>
  );
};

export default ContentBody;
