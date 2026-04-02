export default function ComparisonTable() {
  return (
    <section className="lp-section lp-section-dark fade-in" id="comparatie">
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-section-badge">📋 Comparație</span>
          <h2 className="lp-section-title">GG-AI vs. Metoda Tradițională</h2>
          <p className="lp-section-sub">Vezi diferența clară între a paria pe instinct și a folosi inteligența artificială.</p>
        </div>
        <div className="lp-comparison-table-wrap">
          <table className="lp-comparison-table">
            <thead>
              <tr>
                <th>Funcționalitate</th>
                <th>Pariuri Tradiționale</th>
                <th className="lp-highlight-col">GG-AI PRO</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feat: "Analiză de meciuri", trad: "Manuală, pe instinct", ai: "AI automat + date live" },
                { feat: "Cote ajustate", trad: "Neverificate", ai: "Intervale de cote corecte" },
                { feat: "Formă recentă & H2H", trad: "Căuți manual", ai: "Incluse automat" },
                { feat: "Accidentări & Absențe", trad: "Eventual din știri", ai: "Date ESPN în timp real" },
                { feat: "Bilete generate zilnic", trad: "Le faci singur", ai: "4 bilete/zi auto" },
                { feat: "Evaluare risc bilet", trad: "Bănuieli", ai: "Scor AI + verdict" },
                { feat: "Multi-sport", trad: "De obicei un sport", ai: "Fotbal + Baschet + Hochei + Tenis + Baseball" },
                { feat: "Probabilități model", trad: "Inexistente", ai: "Prob. AI per pariu" },
              ].map((row, i) => (
                <tr key={i}>
                  <td>{row.feat}</td>
                  <td><span className="lp-table-x">✗</span> {row.trad}</td>
                  <td className="lp-highlight-col"><span className="lp-table-check">✓</span> {row.ai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
