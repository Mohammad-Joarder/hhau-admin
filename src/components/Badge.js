import React from 'react';

const TASK_STATUS_CLASS = {
  open: 'badge-open',
  bidding: 'badge-pending',
  bid_accepted: 'badge-pending',
  pending_review: 'badge-pending',
  completed: 'badge-resolved',
  disputed: 'badge-disputed',
  closed: 'badge-muted',
};

const USER_STATUS_CLASS = {
  active: 'badge-active',
  banned: 'badge-banned',
  suspended: 'badge-suspended',
};

const ROLE_CLASS = {
  taker: 'badge-taker',
  provider: 'badge-provider',
  admin: 'badge-admin',
};

export function TaskStatusBadge({ status }) {
  const cls = TASK_STATUS_CLASS[status] || 'badge-muted';
  return <span className={`badge ${cls}`}>{status?.replace(/_/g, ' ') || '—'}</span>;
}

export function UserStatusBadge({ status }) {
  const s = status || 'active';
  const cls = USER_STATUS_CLASS[s] || 'badge-active';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export function RoleBadge({ role }) {
  const cls = ROLE_CLASS[role] || 'badge-active';
  return <span className={`badge ${cls}`}>{role}</span>;
}

export function PillBadge({ children, variant = 'neutral' }) {
  return <span className={`badge badge-pill-${variant}`}>{children}</span>;
}
