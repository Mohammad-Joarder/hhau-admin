import React from 'react';

export default function StatsCard({
  icon,
  label,
  value,
  subValue,
  changePct,
  className = '',
}) {
  const up = changePct != null && changePct > 0;
  const down = changePct != null && changePct < 0;
  return (
    <div className={`stat-card stats-card-enhanced ${className}`}>
      {icon && <div className="stat-card-icon">{icon}</div>}
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value-row">
        <div className="stat-card-value">{value}</div>
        {changePct != null && !Number.isNaN(changePct) && (
          <span className={`stat-change ${up ? 'stat-change-up' : down ? 'stat-change-down' : 'stat-change-flat'}`}>
            {up ? '↑' : down ? '↓' : '—'} {Math.abs(changePct).toFixed(1)}%
          </span>
        )}
      </div>
      {subValue && <div className="stat-card-sub">{subValue}</div>}
    </div>
  );
}
