import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

const STORAGE_KEY = 'hhau_admin_notifications_read_v1';

function loadReadSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveReadSet(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

const NotificationsContext = createContext(null);

async function fetchNotificationSources() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [
    { data: disputesAction },
    { data: tasksStuck },
    { data: largeTx },
    { data: bannedRecent },
    { data: newProviders },
  ] = await Promise.all([
    supabase
      .from('disputes')
      .select('id, task_id, raised_at, needs_admin_review, status')
      .eq('needs_admin_review', true)
      .eq('status', 'open'),
    supabase
      .from('tasks')
      .select('id, title, status, created_at, updated_at')
      .eq('status', 'pending_review')
      .lt('updated_at', since48h),
    supabase
      .from('transactions')
      .select('id, amount, created_at, type, task_id')
      .gte('created_at', since24h)
      .gt('amount', 500),
    supabase
      .from('users')
      .select('id, full_name, status, updated_at')
      .in('status', ['banned', 'suspended'])
      .gte('updated_at', since24h),
    supabase
      .from('users')
      .select('id, full_name, created_at, role')
      .eq('role', 'provider')
      .gte('created_at', since24h),
  ]);

  const items = [];

  (disputesAction || []).forEach((d) => {
    items.push({
      id: `dispute-${d.id}`,
      severity: 'critical',
      type: 'dispute_admin',
      title: 'Dispute needs admin review',
      message: 'A dispute has been escalated and needs your decision.',
      link: '/disputes?needsAction=1',
      entityId: d.id,
      created_at: d.raised_at || new Date().toISOString(),
    });
  });

  (tasksStuck || []).forEach((t) => {
    items.push({
      id: `task-stuck-${t.id}`,
      severity: 'high',
      type: 'task_pending',
      title: 'Task stuck in pending review',
      message: t.title || 'A task has been in pending review for over 48 hours.',
      link: '/tasks?stuck=1',
      entityId: t.id,
      created_at: t.updated_at || t.created_at,
    });
  });

  (largeTx || []).forEach((tx) => {
    items.push({
      id: `tx-large-${tx.id}`,
      severity: 'medium',
      type: 'large_tx',
      title: 'Large transaction (24h)',
      message: `Transaction over A$500 (${tx.type || 'unknown'}).`,
      link: '/financial',
      entityId: tx.id,
      created_at: tx.created_at,
    });
  });

  (bannedRecent || []).forEach((u) => {
    items.push({
      id: `user-status-${u.id}-${u.updated_at}`,
      severity: 'medium',
      type: 'user_moderation',
      title: `User ${u.status}`,
      message: `${u.full_name || u.id} was ${u.status} in the last 24 hours.`,
      link: '/users',
      entityId: u.id,
      created_at: u.updated_at,
    });
  });

  (newProviders || []).forEach((u) => {
    items.push({
      id: `new-provider-${u.id}`,
      severity: 'low',
      type: 'new_provider',
      title: 'New provider registered',
      message: u.full_name || 'A new provider joined.',
      link: '/users?role=provider',
      entityId: u.id,
      created_at: u.created_at,
    });
  });

  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return items;
}

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadSet());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchNotificationSources();
      setItems(next);
    } catch (e) {
      console.error('Notifications refresh', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'disputes' },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  const markRead = useCallback((id) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadSet(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      items.forEach((i) => next.add(i.id));
      saveReadSet(next);
      return next;
    });
  }, [items]);

  const enriched = useMemo(
    () =>
      items.map((i) => ({
        ...i,
        read: readIds.has(i.id),
      })),
    [items, readIds]
  );

  const unreadCount = useMemo(() => enriched.filter((i) => !i.read).length, [enriched]);

  const value = {
    items: enriched,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
