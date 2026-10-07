import React, { type ReactNode } from 'react';

/** Every signed-in page starts the same way: a small eyebrow, the page name (as in the menu), one line of help, actions. */
export const PageHeader: React.FC<{ eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }> = (
  { eyebrow, title, subtitle, actions }) => (
  <header className="k-app-head k-page-header">
    <div className="k-page-header-text">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div className="k-page-header-actions">{actions}</div>}
  </header>
);
