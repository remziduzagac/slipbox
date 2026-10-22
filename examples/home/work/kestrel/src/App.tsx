import { useEffect, useState, type ReactNode } from "react";
import { RouteMap } from "./routes/RouteMap.tsx";
import { ShareLinks } from "./routes/share.ts";

const Lazy = () => import("./routes/share-dialog.wip.tsx");

type Props<T> = { items: T[]; render: (item: T) => ReactNode };

const List = <T,>({ items, render }: Props<T>) => <ul>{items.map((i, n) => <li key={n}>{render(i)}</li>)}</ul>;

function useRoutes(): string[] {
  const [routes, setRoutes] = useState<string[]>([]);
  useEffect(() => {
    fetch("/v2/routes")
      .then((r) => r.json())
      .then((j: { id: string }[]) => setRoutes(j.map((x) => x.id)));
  }, []);
  return routes;
}

export default function App() {
  const routes = useRoutes();
  const [open, setOpen] = useState<string | null>(null);
  const links = new ShareLinks();

  return (
    <main>
      {/* The header is plain on purpose: Tomás owns the visual design */}
      <h1>Kestrel</h1>
      <List items={routes} render={(id) => <button onClick={() => setOpen(id)}>{id}</button>} />
      {open && (
        <>
          <RouteMap routeId={open} zoom={13} onSelect={setOpen} />
          <a href={links.create({ routeId: open })}>Share</a>
        </>
      )}
    </main>
  );
}
