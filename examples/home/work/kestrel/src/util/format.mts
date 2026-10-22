export function formatKm(km: number, digits = 1): string {
  return `${km.toFixed(digits)} km`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export const defaults = { digits: 1, unit: "km" } satisfies { digits: number; unit: string };

export function maybeLength(r?: { km?: number }): string {
  return r?.km !== undefined ? formatKm(r.km) : "unknown";
}
