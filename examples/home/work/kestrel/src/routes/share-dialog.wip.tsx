import { useState } from "react";
import { ShareLinks } from "./share.ts";

// WIP: the share dialog Tomás sketched. The footer is not closed yet.
export function ShareDialog({ routeId, onClose }: { routeId: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  return (
    <dialog open>
      <h2>Share this route</h2>
      <button onClick={() => setUrl(new ShareLinks().create({ routeId }))}>Create link</button>
      {url && <input readOnly value={url} />}
      <footer>
        <button onClick={onClose}>Done</button>
    </dialog>
  );
}
