export default function Loading() {
  return (
    <div className="landing-page" style={{ minHeight: "100vh" }}>
      {/* Navbar skeleton */}
      <div style={{ height: 64, borderBottom: "1px solid rgba(255,255,255,0.06)" }} />

      {/* Hero skeleton */}
      <div style={{ padding: "160px 0 100px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ width: 280, height: 36, background: "rgba(255,255,255,0.04)", borderRadius: 100, margin: "0 auto 32px" }} />
          <div style={{ height: 56, background: "rgba(255,255,255,0.06)", borderRadius: 12, marginBottom: 16 }} />
          <div style={{ height: 56, background: "rgba(255,255,255,0.04)", borderRadius: 12, marginBottom: 24 }} />
          <div style={{ height: 18, background: "rgba(255,255,255,0.03)", borderRadius: 8, maxWidth: 500, margin: "0 auto 40px" }} />
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <div style={{ width: 180, height: 52, background: "rgba(59,130,246,0.15)", borderRadius: 12 }} />
            <div style={{ width: 180, height: 52, background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div style={{ display: "flex", justifyContent: "center", gap: 48, padding: "0 24px 60px" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 28, background: "rgba(255,255,255,0.06)", borderRadius: 6, margin: "0 auto 6px" }} />
            <div style={{ width: 80, height: 12, background: "rgba(255,255,255,0.03)", borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
