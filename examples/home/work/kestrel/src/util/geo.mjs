/**
 * Geo helpers. Distances follow {@link https://en.wikipedia.org/wiki/Haversine_formula the haversine formula}.
 * See also {@link ./compat.cjs toRadians} for the conversion used here.
 */
const R = 6371008.8;

export const haversine = function (a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const midpoint = function (a, b) {
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
};

export const bbox = (points) => ({
  minLat: Math.min(...points.map((p) => p.lat)),
  maxLat: Math.max(...points.map((p) => p.lat)),
});
