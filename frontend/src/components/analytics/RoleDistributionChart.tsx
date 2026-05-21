import React from 'react';
import HorizontalBarChart, { type BarChartItem } from './HorizontalBarChart';

interface RoleCounts {
  trainee: number;
  supervisor: number;
  instructor: number;
  admin: number;
}

interface RoleDistributionChartProps {
  byRole: RoleCounts;
}

const ROLE_LABELS: Record<keyof RoleCounts, string> = {
  trainee: 'Trainees',
  supervisor: 'Supervisors',
  instructor: 'Instructors',
  admin: 'Admins',
};

const RoleDistributionChart: React.FC<RoleDistributionChartProps> = ({ byRole }) => {
  const items: BarChartItem[] = (Object.keys(ROLE_LABELS) as (keyof RoleCounts)[]).map(key => ({
    id: key,
    label: ROLE_LABELS[key],
    value: byRole[key] ?? 0,
  }));

  return <HorizontalBarChart items={items} variant="violet" emptyMessage="No user data" />;
};

export default RoleDistributionChart;
