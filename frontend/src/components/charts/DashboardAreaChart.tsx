import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint } from './AdminCharts';
import '../../assets/css/DashboardCharts.css';

const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 8,
  color: '#f1f5f9',
};

export interface DashboardAreaChartProps {
  title: string;
  subtitle?: string;
  data: ChartPoint[];
  color?: string;
  height?: number;
  gradientId: string;
}

const DashboardAreaChart: React.FC<DashboardAreaChartProps> = ({
  title,
  subtitle,
  data,
  color = '#3b82f6',
  height = 200,
  gradientId,
}) => (
  <div className="dashboard-area-chart">
    <div className="dashboard-area-chart__head">
      <h3 className="dashboard-area-chart__title">{title}</h3>
      {subtitle && <p className="dashboard-area-chart__subtitle">{subtitle}</p>}
    </div>
    {data.length === 0 ? (
      <p className="dashboard-area-chart__empty">No sessions in this category yet</p>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.5} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickFormatter={v => `${v}%`}
            width={36}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={value => [`${Number(value)}%`, 'Score']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    )}
  </div>
);

export default DashboardAreaChart;
