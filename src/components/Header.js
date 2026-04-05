import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotifications } from '../context/NotificationsContext';
import { formatDateAu, timeAgo } from '../utils/format';

const TITLE_MAP = {
  '/': 'Dashboard',
  '/categories': 'Categories',
  '/disputes': 'Dispute management',
  '/tasks': 'Task management',
  '/users': 'User management',
  '/financial': 'Financial overview',
  '/analytics': 'Analytics',
  '/notifications': 'Notifications',
  '/wallet': 'Financial overview',
  '/settings': 'Settings',
};

export default function Header({ onManualRefresh }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { items, unreadCount, markRead, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const title = TITLE_MAP[location.pathname] || 'Admin';

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const top10 = items.slice(0, 10);
  const pulse = unreadCount > 0;

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-title-block">
          <h1 className="app-header-title">{title}</h1>
          <p className="app-header-sub">HelpingHandsAu operations</p>
        </div>
        <div className="app-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm header-refresh"
            onClick={() => {
              onManualRefresh?.();
              refresh();
              window.dispatchEvent(new CustomEvent('hhau-admin-refresh'));
            }}
          >
            ↻ Refresh
          </button>
          <div className="notif-wrap" ref={ref}>
            <button
              type="button"
              className={`notif-bell ${pulse ? 'notif-bell-pulse' : ''}`}
              aria-label="Notifications"
              onClick={() => setOpen((o) => !o)}
            >
              🔔
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {open && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-head">
                  <strong>Alerts</strong>
                  <button type="button" className="link-btn" onClick={() => navigate('/notifications')}>
                    View all
                  </button>
                </div>
                {top10.length === 0 ? (
                  <div className="notif-empty">No alerts right now</div>
                ) : (
                  <ul className="notif-list">
                    {top10.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={`notif-item ${n.read ? 'read' : ''}`}
                          onClick={() => {
                            markRead(n.id);
                            setOpen(false);
                            navigate(n.link);
                          }}
                        >
                          <span className={`notif-dot sev-${n.severity}`} />
                          <div className="notif-item-body">
                            <div className="notif-item-title">{n.title}</div>
                            <div className="notif-item-meta">
                              {timeAgo(n.created_at)} · {formatDateAu(n.created_at)}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
