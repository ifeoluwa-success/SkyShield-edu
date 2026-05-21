import React from 'react';

interface AnalyticsStatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  barPercent?: number;
  icon?: React.ReactNode;
}

const AnalyticsStatCard: React.FC<AnalyticsStatCardProps> = ({
  label,
  value,
  hint,
  variant = 'default',
  barPercent,
  icon,
}) => (
  <div className={`analytics-stat-card variant-${variant}`}>
    <div className="analytics-stat-head">
      {icon && <div className="analytics-stat-icon">{icon}</div>}
      <div className="analytics-stat-label">{label}</div>
    </div>
    <div className="analytics-stat-value">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
    {hint && <div className="analytics-stat-hint">{hint}</div>}
    {barPercent != null && (
      <div className="analytics-stat-bar-track">
        <div
          className="analytics-stat-bar-fill"
          style={{ width: `${Math.min(100, Math.max(0, barPercent))}%` }}
        />
      </div>
    )}
  </div>
);

export default AnalyticsStatCard;
