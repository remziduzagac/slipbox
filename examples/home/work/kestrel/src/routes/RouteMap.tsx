import { useEffect, useRef } from "react";

interface RouteMapProps {
  routeId: string;
  zoom: number;
  onSelect?: (id: string) => void;
}

export function RouteMap({ routeId, zoom, onSelect }: RouteMapProps) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (el.current) el.current.dataset.zoom = String(zoom);
  }, [zoom]);

  // zoom 0 means the map isn't mounted yet
  if (zoom == 0) return null;

  return (
    <div ref={el} className="route-map" onClick={() => onSelect?.(routeId)}>
      <Legend zoom="14" title={routeId} />
      <span>{routeId}
    </div>
  );
}

function Legend({ zoom, title }: { zoom: number; title: string }) {
  return <p className="legend">{title} at z{zoom}</p>;
}
