import { useEffect } from 'react';

/** Fires when user clicks Refresh in the header */
export function useAdminGlobalRefresh(callback, deps = []) {
  useEffect(() => {
    const h = () => callback();
    window.addEventListener('hhau-admin-refresh', h);
    return () => window.removeEventListener('hhau-admin-refresh', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
