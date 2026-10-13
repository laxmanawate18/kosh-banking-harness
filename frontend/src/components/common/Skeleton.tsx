import React from 'react';

/** Shimmering placeholders shaped like the content that is loading, so nothing jumps when it arrives. */
const Skeleton: React.FC<{ width?: string | number; height?: number; radius?: number; className?: string }> = (
  { width = '100%', height = 14, radius = 8, className = '' }) => (
  <span className={`k-skel ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />
);

/** Rows for tables and lists while they load. Announced once as "Loading" for screen readers. */
export const SkeletonRows: React.FC<{ rows?: number; label?: string }> = ({ rows = 5, label = 'Loading' }) => (
  <div className="k-skel-rows" role="status" aria-label={label}>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="k-skel-row">
        <Skeleton width={36} height={36} radius={18} />
        <span className="k-skel-lines"><Skeleton width={`${55 + ((i * 17) % 30)}%`} /><Skeleton width="35%" height={11} /></span>
        <Skeleton width={72} height={14} />
      </div>
    ))}
  </div>
);
