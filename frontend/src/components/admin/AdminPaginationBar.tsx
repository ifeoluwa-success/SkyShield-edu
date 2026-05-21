import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AdminPaginationBarProps {
  count: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

const AdminPaginationBar: React.FC<AdminPaginationBarProps> = ({
  count,
  page,
  pageSize,
  hasNext,
  hasPrevious,
  onPrev,
  onNext,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}) => {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  return (
    <div className="pagination-bar">
      <span>
        Page {page} of {totalPages.toLocaleString()} · Showing {from}–{to} of{' '}
        {count.toLocaleString()}
      </span>
      <div className="pagination-actions">
        {onPageSizeChange && (
          <select
            className="admin-filter-select"
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map(n => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
        <button type="button" className="filter-button" disabled={!hasPrevious} onClick={onPrev}>
          <ChevronLeft size={16} /> Previous
        </button>
        <button type="button" className="filter-button" disabled={!hasNext} onClick={onNext}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default AdminPaginationBar;
