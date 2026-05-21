import React from 'react';

export interface TrendRow {
  period: string | null;
  avg_score: number;
  active_learners?: number;
  completions?: number;
  avg_sessions_per_user?: number;
  count?: number;
}

interface TrendsTableProps {
  rows: TrendRow[];
  showCompletions?: boolean;
}

const TrendsTable: React.FC<TrendsTableProps> = ({ rows, showCompletions }) => {
  if (rows.length === 0) {
    return <p className="analytics-chart-empty">No trend data for this period.</p>;
  }

  return (
    <div className="analytics-trends-table">
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Avg score</th>
            <th>Active learners</th>
            {showCompletions && <th>Completions</th>}
            <th>Avg sessions/user</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.period ?? 'unknown'}>
              <td>{row.period ?? '—'}</td>
              <td>{Math.round(row.avg_score)}</td>
              <td>{row.active_learners ?? row.count ?? '—'}</td>
              {showCompletions && <td>{row.completions ?? '—'}</td>}
              <td>{row.avg_sessions_per_user?.toFixed(1) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TrendsTable;
