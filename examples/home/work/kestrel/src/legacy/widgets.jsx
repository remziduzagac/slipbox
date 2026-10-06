import React from "react";

// Legacy widgets. TODO: someone pasted a TS type here; this file is plain JSX.
export function Badge({ label }: { label: string }) {
  return <span className="badge">{label}</span>;
}

export function Spinner() {
  return <div className="spinner" aria-busy="true" />;
}

export const Panel = ({ title, children }) => (
  <section>
    <h3>{title}</h3>
    {children}
  </section>
);
