export function formatElapsed(ms: number): string {
  if (ms < 0) return '0s';
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    const frac = ms % 1000;
    return frac > 0 ? `${seconds}.${Math.floor(frac / 100)}s` : `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
