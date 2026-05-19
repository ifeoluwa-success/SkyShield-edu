export function ContentGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="materials-grid" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="material-card skeleton-card">
          <div className="skeleton-block skeleton-icon" />
          <div className="skeleton-body">
            <div className="skeleton-block skeleton-title" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
