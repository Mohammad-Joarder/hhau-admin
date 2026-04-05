import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationsContext';
import { formatDateAu, timeAgo } from '../utils/format';

export default function NotificationsPage() {
  const { items, markRead, markAllRead, refresh, loading } = useNotifications();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [readFilter, setReadFilter] = React.useState('all');

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (typeFilter !== 'all' && n.severity !== typeFilter) return false;
      if (readFilter === 'unread' && n.read) return false;
      if (readFilter === 'read' && !n.read) return false;
      return true;
    });
  }, [items, typeFilter, readFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>Notifications</h1>
        <p>Operational alerts derived from live data</p>
      </div>

      <div className="table-card" style={{ marginBottom: 16 }}>
        <div className="table-card-header">
          <h3>Filters</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh()}>
              ↻ Refresh
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={markAllRead}>
              Mark all read
            </button>
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select className="form-input form-select" style={{ width: 180 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="form-input form-select" style={{ width: 160 }} value={readFilter} onChange={(e) => setReadFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <p>No notifications match filters</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {filtered.map((n) => (
            <li key={n.id} className="table-card" style={{ marginBottom: 10, padding: 0 }}>
              <button
                type="button"
                onClick={() => {
                  markRead(n.id);
                  navigate(n.link);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 16,
                  border: 'none',
                  background: n.read ? '#FAFAFA' : '#fff',
                  cursor: 'pointer',
                  borderRadius: 12,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <span className={`notif-dot sev-${n.severity}`} style={{ marginTop: 4 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{n.title}</div>
                  <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {n.message}
                  </div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
                    {timeAgo(n.created_at)} · {formatDateAu(n.created_at)}
                  </div>
                </div>
                {!n.read && <span className="badge badge-pill-warn">New</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
