import React from 'react';

export default function Pagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const p = Math.min(page, totalPages);

  return (
    <div className="pagination-bar">
      <span className="pagination-info">
        Page {p} of {totalPages}
        {total != null && ` · ${total} total`}
      </span>
      <div className="pagination-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={p <= 1}
          onClick={() => onPageChange(p - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={p >= totalPages}
          onClick={() => onPageChange(p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
