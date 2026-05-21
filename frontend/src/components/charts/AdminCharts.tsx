import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import '../../assets/css/AdminCharts.css';

const CHART_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 8,
  color: '#f1f5f9',
};

export interface ChartPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface AdminAreaChartProps {
  title: string;
  data: ChartPoint[];
  dataKey?: string;
  height?: number;
}

export const AdminAreaChart: React.FC<AdminAreaChartProps> = ({
  title,
  data,
  dataKey = 'value',
  height = 260,
}) => (
  <div className="admin-chart-panel">
    <h3 className="admin-chart-title">{title}</h3>
    {data.length === 0 ? (
      <p className="admin-chart-empty">No data for this period</p>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="#3b82f6"
            fill="url(#areaFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    )}
  </div>
);

interface AdminBarChartProps {
  title: string;
  data: ChartPoint[];
  dataKey?: string;
  height?: number;
  color?: string;
}

export const AdminBarChart: React.FC<AdminBarChartProps> = ({
  title,
  data,
  dataKey = 'value',
  height = 260,
  color = '#8b5cf6',
}) => (
  <div className="admin-chart-panel">
    <h3 className="admin-chart-title">{title}</h3>
    {data.length === 0 ? (
      <p className="admin-chart-empty">No data for this period</p>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )}
  </div>
);

interface AdminPieChartProps {
  title: string;
  data: ChartPoint[];
  height?: number;
}

export const AdminPieChart: React.FC<AdminPieChartProps> = ({
  title,
  data,
  height = 260,
}) => (
  <div className="admin-chart-panel">
    <h3 className="admin-chart-title">{title}</h3>
    {data.length === 0 ? (
      <p className="admin-chart-empty">No data</p>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    )}
  </div>
);
