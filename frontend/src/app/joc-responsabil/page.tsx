import Link from "next/link";

export const metadata = {
  title: "Joc Responsabil — GG-AI",
};

export default function JocResponsabilPage() {
  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--bg-deep)" }}>
      <div className="mesh-bg" />
      <div className="noise-overlay" />

      <div className="relative z-10 max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:text-primary-hover transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Înapoi la pagina principală
          </Link>
        </div>

        <div className="card p-8 md:p-12">
          <h1 className="text-3xl font-bold text-white mb-2">Joc Responsabil</h1>
          <p className="text-text-muted text-sm mb-8">Ultima actualizare: 6 martie 2026</p>

          <div className="prose prose-invert max-w-none space-y-6 text-text-secondary text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Angajamentul nostru</h2>
              <p>
                GG-AI promovează pariurile sportive responsabile și se angajează să ofere un mediu sigur
                pentru toți utilizatorii săi. Credem că pariurile sportive trebuie să rămână o formă de
                divertisment și nu ar trebui să afecteze negativ viața utilizatorilor noștri.
              </p>
              <p className="mt-3 font-semibold text-yellow-400">
                ⚠ IMPORTANT: GG-AI este o platformă de analiză și predicții sportive. NU suntem o casă
                de pariuri și NU acceptăm pariuri. Predicțiile noastre sunt generate de algoritmi de
                inteligență artificială și reprezintă estimări bazate pe date statistice, nu certitudini.
                Nu garantăm câștiguri.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. Principii de joc responsabil</h2>
              <p>Recomandăm tuturor utilizatorilor să respecte următoarele principii:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Pariați doar sume pe care vă permiteți să le pierdeți;</li>
                <li>Stabiliți un buget zilnic, săptămânal sau lunar și respectați-l strict;</li>
                <li>Nu încercați să recuperați pierderile prin pariuri mai mari;</li>
                <li>Nu considerați pariurile sportive o sursă de venit;</li>
                <li>Nu pariați sub influența alcoolului, a drogurilor sau în stări emoționale intense;</li>
                <li>Luați pauze regulate de la pariuri;</li>
                <li>Nu împrumutați bani pentru a paria.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. Semne de avertizare</h2>
              <p>
                Dacă observați unul sau mai multe dintre următoarele comportamente, este posibil
                să aveți o problemă cu jocurile de noroc:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Pariați mai mulți bani decât vă permiteți să pierdeți;</li>
                <li>Încercați constant să recuperați pierderile;</li>
                <li>Pariurile vă afectează relațiile personale sau profesionale;</li>
                <li>Vă simțiți anxios sau iritabil când nu puteți paria;</li>
                <li>Ascundeți activitatea de pariere de familie sau prieteni;</li>
                <li>Împrumutați bani sau vindeți bunuri pentru a paria;</li>
                <li>Neglijați responsabilitățile zilnice din cauza pariurilor;</li>
                <li>Pariați pentru a scăpa de stres sau probleme personale.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. Auto-excludere</h2>
              <p>
                Dacă simțiți că aveți nevoie de o pauză de la platformă, puteți solicita oricând
                dezactivarea temporară sau permanentă a contului dumneavoastră. Contactați-ne la
                <strong className="text-white"> contact@ggai.bet</strong> cu subiectul
                &quot;Auto-excludere&quot; și vom procesa cererea în cel mai scurt timp posibil.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. Protecția minorilor</h2>
              <p>
                Platforma GG-AI este strict interzisă persoanelor sub 18 ani. Ne angajăm să:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Verificăm vârsta utilizatorilor la momentul înregistrării;</li>
                <li>Închidem imediat conturile utilizatorilor care nu îndeplinesc cerința de vârstă;</li>
                <li>Nu direcționăm conținut de marketing către minori.</li>
              </ul>
              <p className="mt-3">
                Dacă sunteți părinte sau tutore și suspectați că un minor folosește platforma noastră,
                vă rugăm să ne contactați imediat la <strong className="text-white">contact@ggai.bet</strong>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. Resurse de ajutor</h2>
              <p>
                Dacă dumneavoastră sau cineva apropiat se confruntă cu probleme legate de jocurile
                de noroc, vă recomandăm să contactați următoarele organizații:
              </p>
              <ul className="list-none space-y-3 mt-3">
                <li>
                  <strong className="text-white">Agenția Națională pentru Jocuri de Noroc (ONJN)</strong><br />
                  Website:{" "}
                  <a href="https://www.onjn.gov.ro" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    www.onjn.gov.ro
                  </a>
                </li>
                <li>
                  <strong className="text-white">GambleAware</strong><br />
                  Website:{" "}
                  <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    www.begambleaware.org
                  </a>
                </li>
                <li>
                  <strong className="text-white">Gamblers Anonymous</strong><br />
                  Website:{" "}
                  <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    www.gamblersanonymous.org
                  </a>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Sfaturi pentru pariuri responsabile</h2>
              <ul className="list-disc list-inside space-y-1">
                <li>Tratați pariurile ca pe o formă de divertisment, nu ca pe o investiție;</li>
                <li>Stabiliți limite de timp și de bani înainte de a paria;</li>
                <li>Nu urmăriți pierderile — acceptați că pierderile fac parte din procesul de pariere;</li>
                <li>Pariați doar cu bani pe care vă permiteți să îi pierdeți;</li>
                <li>Mențineți un echilibru sănătos între pariuri și alte activități;</li>
                <li>Nu pariați niciodată bani destinați cheltuielilor esențiale (chirie, facturi, mâncare);</li>
                <li>Luați decizii raționale, nu emoționale.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Contact</h2>
              <p>
                Pentru orice întrebări sau solicitări legate de jocul responsabil, ne puteți
                contacta la:
              </p>
              <ul className="list-none space-y-1 mt-2">
                <li>📧 Email: contact@ggai.bet</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
