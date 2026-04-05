import React, { useEffect } from 'react';

export default function SlideOver({ open, onClose, title, children, width = 440 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="slide-over-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="slide-over"
        style={{ width: `min(100vw - 48px, ${width}px)` }}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Panel'}
      >
        <div className="slide-over-header">
          {title && <h2 className="slide-over-title">{title}</h2>}
          <button type="button" className="slide-over-close" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>
        <div className="slide-over-body">{children}</div>
      </aside>
    </>
  );
}
