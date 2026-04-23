export function OverviewPlaceholder() {
  return (
    <>
      <div className="page-title">Overview</div>
      <div className="page-sub">Placeholder — not yet ported to React.</div>
      <div className="card">
        <div className="card-hdr">Migration status</div>
        <div style={{ padding: '18px', fontSize: '.88em', lineHeight: 1.6 }}>
          The Settings page is the first proof-of-concept port. Other pages still live in
          the legacy <code>index.html</code> on the <code>main</code> branch.
        </div>
      </div>
    </>
  );
}
