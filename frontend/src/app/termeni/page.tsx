import Link from "next/link";

export const metadata = {
  title: "Termeni și Condiții — GG-AI",
};

export default function TermeniPage() {
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
          <h1 className="text-3xl font-bold text-white mb-2">Termeni și Condiții</h1>
          <p className="text-text-muted text-sm mb-8">Ultima actualizare: 6 martie 2026</p>

          <div className="prose prose-invert max-w-none space-y-6 text-text-secondary text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Informații generale</h2>
              <p>
                Prezentul document stabilește termenii și condițiile de utilizare a platformei GG-AI
                (denumită în continuare &quot;Platforma&quot;), operată de GG-AI SRL (denumită în continuare
                &quot;Operatorul&quot;). Prin accesarea și utilizarea Platformei, utilizatorul confirmă că a citit,
                a înțeles și este de acord cu acești termeni și condiții în totalitate.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. Descrierea serviciului</h2>
              <p>
                GG-AI este o platformă care utilizează inteligența artificială pentru a analiza date sportive
                și a genera predicții și sugestii de pariuri sportive. Serviciile noastre includ:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Analize generate prin inteligență artificială pentru diverse sporturi;</li>
                <li>Tichete zilnice cu selecții recomandate;</li>
                <li>Clasamente de încredere (confidence scoring) pentru meciuri;</li>
                <li>Acces la date și statistici sportive actualizate.</li>
              </ul>
              <p className="mt-3 font-semibold text-yellow-400">
                ⚠ AVERTISMENT IMPORTANT: GG-AI NU garantează câștiguri. Pariurile sportive implică riscuri
                financiare semnificative. Predicțiile noastre sunt generate de algoritmi de inteligență
                artificială și reprezintă estimări bazate pe date statistice, nu certitudini. Utilizatorul
                este singurul responsabil pentru deciziile de pariere luate.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. Condiții de eligibilitate</h2>
              <p>Pentru a utiliza Platforma, utilizatorul trebuie:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Să aibă vârsta minimă de 18 ani;</li>
                <li>Să aibă capacitate juridică deplină;</li>
                <li>Să nu fie rezident al unei jurisdicții în care pariurile sportive sunt interzise;</li>
                <li>Să furnizeze informații corecte și complete la momentul înregistrării;</li>
                <li>Să respecte toate legile și reglementările aplicabile din jurisdicția sa.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. Crearea contului și securitate</h2>
              <p>
                Utilizatorul este responsabil pentru menținerea confidențialității credențialelor
                contului său (email și parolă). Orice activitate desfășurată prin contul utilizatorului
                este responsabilitatea acestuia. Utilizatorul se obligă:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Să nu partajeze datele de acces cu terțe persoane;</li>
                <li>Să notifice imediat Operatorul în cazul accesului neautorizat al contului;</li>
                <li>Să utilizeze o parolă puternică și unică pentru cont;</li>
                <li>Să furnizeze o adresă de email validă și accesibilă.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. Abonamente și plăți</h2>
              <p>
                Accesul la funcționalitățile premium ale Platformei necesită un abonament plătit.
                Detaliile privind prețurile, perioadele de abonament și beneficiile incluse sunt
                afișate pe pagina de prețuri a Platformei.
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Plățile sunt procesate prin Stripe, un procesor de plăți securizat și certificat PCI DSS;</li>
                <li>Abonamentele se reînnoiesc automat la sfârșitul perioadei, cu excepția cazului în care sunt anulate;</li>
                <li>Anularea abonamentului se poate face oricând din secțiunea &quot;Cont&quot;;</li>
                <li>După anulare, accesul premium rămâne activ până la sfârșitul perioadei plătite;</li>
                <li>Operatorul își rezervă dreptul de a modifica prețurile, cu notificare prealabilă de 30 de zile.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. Politica de rambursare</h2>
              <p>
                Nu se oferă rambursări. Prin achiziționarea unui abonament, utilizatorul
                confirmă că a înțeles și acceptă că toate plățile sunt finale și
                nerambursabile. Conform Directivei 2011/83/UE, Art. 16(m), dreptul de
                retragere nu se aplică serviciilor digitale a căror prestare a început
                cu acordul prealabil expres al consumatorului, acesta recunoscând că
                își pierde dreptul de retragere. Prin activarea abonamentului,
                utilizatorul consimte expres la furnizarea imediată a serviciului și
                renunță la dreptul de retragere.
              </p>
              <p className="mt-3">
                Anularea abonamentului oprește reînnoirea automată, dar nu generează
                rambursarea sumei deja plătite. Accesul premium rămâne activ până la
                sfârșitul perioadei de facturare curente.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Limitarea răspunderii</h2>
              <p>
                Operatorul nu este responsabil pentru:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Pierderile financiare rezultate din utilizarea predicțiilor sau recomandărilor Platformei;</li>
                <li>Deciziile de pariere luate de utilizator pe baza analizelor furnizate;</li>
                <li>Indisponibilitatea temporară a Platformei din motive tehnice;</li>
                <li>Erorile sau inexactitățile datelor furnizate de surse terțe;</li>
                <li>Modificările cote sau anularea evenimentelor sportive;</li>
                <li>Daunele indirecte, incidentale sau speciale de orice natură.</li>
              </ul>
              <p className="mt-3">
                Răspunderea maximă a Operatorului, în orice circumstanță, este limitată la valoarea
                abonamentului plătit de utilizator în ultimele 3 luni.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Proprietate intelectuală</h2>
              <p>
                Toate drepturile de proprietate intelectuală asupra Platformei, incluzând dar fără a
                se limita la: codul sursă, algoritmii, designul, logo-urile, textele și analizele
                generate, aparțin exclusiv Operatorului. Utilizatorul nu are dreptul de a:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Copia, modifica sau distribui conținutul Platformei;</li>
                <li>Revinde sau redistribui analizele sau predicțiile;</li>
                <li>Utiliza tehnici de scraping, crawling sau extragere automată de date;</li>
                <li>Dezasambla sau decompila algoritmii Platformei.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">9. Comportament interzis</h2>
              <p>Utilizatorii se obligă să nu:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Utilizeze Platforma în scopuri ilegale sau frauduloase;</li>
                <li>Creeze conturi multiple pentru a beneficia de oferte promoționale;</li>
                <li>Partajeze contul premium cu persoane neautorizate;</li>
                <li>Încerce să obțină acces neautorizat la sisteme sau date;</li>
                <li>Transmită conținut malițios, viruși sau cod dăunător;</li>
                <li>Interfereze cu funcționarea normală a Platformei.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">10. Suspendarea și încetarea contului</h2>
              <p>
                Operatorul își rezervă dreptul de a suspenda sau închide contul utilizatorului în
                cazul încălcării acestor termeni și condiții, fără notificare prealabilă și fără
                obligația de rambursare. Utilizatorul poate solicita ștergerea contului oricând,
                conform drepturilor sale GDPR.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">11. Jocul responsabil</h2>
              <p>
                GG-AI promovează pariurile responsabile. Recomandăm utilizatorilor:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Să parieze doar sume pe care și le permit să le piardă;</li>
                <li>Să stabilească limite de buget și să le respecte;</li>
                <li>Să nu considere pariurile ca o sursă de venit;</li>
                <li>Să solicite ajutor profesional dacă dezvoltă tendințe de joc compulsiv.</li>
              </ul>
              <p className="mt-3">
                Dacă simți că ai o problemă cu jocurile de noroc, te rugăm să contactezi o linie de
                asistență specializată sau organizații precum GambleAware.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">12. Legislație aplicabilă și jurisdicție</h2>
              <p>
                Acești termeni și condiții sunt guvernați de legislația din România. Orice dispute
                vor fi soluționate de instanțele competente din România. Platforma respectă
                legislația europeană aplicabilă, inclusiv Regulamentul General privind Protecția
                Datelor (GDPR) și directivele UE privind comerțul electronic.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">13. Modificarea termenilor</h2>
              <p>
                Operatorul își rezervă dreptul de a modifica acești termeni și condiții oricând.
                Utilizatorii vor fi notificați cu privire la modificări prin email sau prin
                notificări pe Platformă cu cel puțin 30 de zile înainte de intrarea în vigoare
                a noilor termeni. Continuarea utilizării Platformei după această perioadă constituie
                acceptarea noilor termeni.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">14. Forța majoră</h2>
              <p>
                Operatorul nu este responsabil pentru neîndeplinirea obligațiilor cauzate de
                evenimente de forță majoră, inclusiv dar fără a se limita la: catastrofe naturale,
                pandemii, războaie, atacuri cibernetice, întreruperi ale serviciilor de internet sau
                modificări legislative.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">15. Contact</h2>
              <p>
                Pentru orice întrebări sau solicitări legate de acești termeni și condiții,
                ne puteți contacta la:
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
