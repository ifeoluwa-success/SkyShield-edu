/** Unwrap list endpoints that return either a bare array or `{ results: T[] }`. */
export function unwrapList<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.results)) return data.results;
  return [];
}

/** Trigger a browser download of CSV text. */
export function downloadCsv(filename: string, rows: string[][]): void {
  const escape = (cell: string) => {
    const s = String(cell ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const body = rows.map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
