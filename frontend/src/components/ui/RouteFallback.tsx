import { Spinner } from './Loading';

/** Lightweight route transition — keeps chrome visible when used inside layouts. */
export function RouteFallback({ message = 'Loading…' }: { message?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 py-10 text-[var(--text-secondary)]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
