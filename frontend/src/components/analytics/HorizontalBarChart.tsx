import React from 'react';

export interface BarChartItem {
  id: string;
  label: string;
  value: number;
  displayValue?: string;
}

interface HorizontalBarChartProps {
  items: BarChartItem[];
  maxValue?: number;
  emptyMessage?: string;
  variant?: 'cyan' | 'violet' | 'green';
}

const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  items,
  maxValue,
  emptyMessage = 'No data available',
  variant = 'cyan',
}) => {
  if (items.length === 0) {
    return <p className="analytics-chart-empty">{emptyMessage}</p>;
  }

  const max = maxValue ?? Math.max(...items.map(i => i.value), 1);

  return (
    <div className="analytics-bar-chart">
      {items.map(item => (
        <div className="analytics-bar-row" key={item.id}>
          <span className="analytics-bar-label" title={item.label}>
            {item.label}
          </span>
          <div className="analytics-bar-track">
            <div
              className={`analytics-bar-fill fill-${variant}`}
              style={{ width: `${Math.min(100, (item.value / max) * 100).toFixed(1)}%` }}
            />
          </div>
          <span className="analytics-bar-value">
            {item.displayValue ?? item.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

export default HorizontalBarChart;
