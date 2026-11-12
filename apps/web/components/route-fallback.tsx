export function RouteFallback({ label }: { label: string }) {
  return (
    <div className="nama-root app-shell">
      <main className="app-main">
        <p className="app-muted">{label}</p>
      </main>
    </div>
  );
}
