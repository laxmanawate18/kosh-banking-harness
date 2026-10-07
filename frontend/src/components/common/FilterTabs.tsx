import React, { type ReactNode } from 'react';
import { ActiveIndicator } from './Animate';

export type FilterTab = { id: string; label: string; count?: number; icon?: ReactNode };

/**
 * A row of filters with a highlight that slides to the chosen one. Scrolls sideways on phones instead of wrapping.
 * `name` keeps two rows on one page from sharing the same sliding highlight.
 */
export const FilterTabs: React.FC<{ tabs: FilterTab[]; value: string; onChange: (id: string) => void; label: string; name?: string }> = (
  { tabs, value, onChange, label, name = 'filters' }) => (
  <div className="k-filter-tabs" role="tablist" aria-label={label}>
    {tabs.map(tab => {
      const active = tab.id === value;
      return (
        <button key={tab.id} type="button" role="tab" aria-selected={active} className={`k-filter-tab ${active ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}>
          {active && <ActiveIndicator id={`tabs-${name}`} className="k-filter-pill" />}
          {tab.icon}
          <span>{tab.label}</span>
          {typeof tab.count === 'number' && tab.count > 0 && <span className="k-count">{tab.count}</span>}
        </button>
      );
    })}
  </div>
);
