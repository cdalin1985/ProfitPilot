export function relativeTime(occurredAt: string, generatedAt: string): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.parse(generatedAt) - Date.parse(occurredAt)) / 60_000),
  );
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
