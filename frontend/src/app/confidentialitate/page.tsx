import Link from "next/link";

export const metadata = {
  title: "Politica de Confidențialitate — GG-AI",
};

export default function ConfidentialitatePage() {
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
          <h1 className="text-3xl font-bold text-white mb-2">Politica de Confidențialitate</h1>
          <p className="text-text-muted text-sm mb-8">Ultima actualizare: 16 martie 2026</p>

          <div className="prose prose-invert max-w-none space-y-6 text-text-secondary text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Introducere</h2>
              <p>
                RAILIE SRL (denumit în continuare &quot;Operatorul&quot;, &quot;noi&quot;) se angajează să
                protejeze confidențialitatea și datele personale ale utilizatorilor săi. Această
                politică de confidențialitate descrie modul în care colectăm, utilizăm, stocăm și
                protejăm datele dumneavoastră personale, în conformitate cu Regulamentul (UE)
                2016/679 (Regulamentul General privind Protecția Datelor — GDPR), Legea nr. 190/2018
                privind măsuri de punere în aplicare a GDPR în România și alte reglementări aplicabile.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. Operator de date</h2>
              <p>Operatorul de date cu caracter personal este:</p>
              <ul className="list-none space-y-1 mt-2">
                <li><strong className="text-white">Denumire:</strong> RAILIE SRL</li>
                <li><strong className="text-white">CUI:</strong> [CUI_PLACEHOLDER]</li>
                <li><strong className="text-white">Sediul social:</strong> Petrești, str. Mihai Viteazu, nr. 66, județ Alba, România</li>
                <li><strong className="text-white">Email contact:</strong> contact@ggai.bet</li>
                <li><strong className="text-white">Responsabil protecția datelor (DPO):</strong> contact@ggai.bet</li>
              </ul>
              <p className="mt-3 text-yellow-400 text-xs">
                La adresa sediului social NU se desfășoară relații cu publicul. Activitatea societății
                se desfășoară exclusiv online.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. Datele personale colectate</h2>
              <p>Colectăm următoarele categorii de date personale:</p>

              <h3 className="text-base font-medium text-white mt-4 mb-2">3.1 Date furnizate direct de utilizator:</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Nume complet;</li>
                <li>Adresă de email;</li>
                <li>Data nașterii;</li>
                <li>Parola (stocată în formă criptată/hash);</li>
                <li>Informații de plată (procesate de Stripe — nu stocăm date de card).</li>
              </ul>

              <h3 className="text-base font-medium text-white mt-4 mb-2">3.2 Date colectate automat:</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Adresa IP;</li>
                <li>Tipul și versiunea browserului;</li>
                <li>Sistemul de operare;</li>
                <li>Pagini vizitate și timpul petrecut pe platformă;</li>
                <li>Date de autentificare (data și ora ultimei conectări);</li>
                <li>Identificatori unici de dispozitiv.</li>
              </ul>

              <h3 className="text-base font-medium text-white mt-4 mb-2">3.3 Date de la terți:</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Date de profil Google (nume, email, fotografie) — dacă utilizați autentificarea cu Google;</li>
                <li>Date de la procesatorul de plăți Stripe (status plată, ID tranzacție).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. Scopul și temeiul legal al prelucrării</h2>
              <table className="w-full text-sm border-collapse mt-2">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 pr-4 text-white">Scop</th>
                    <th className="text-left py-2 text-white">Temei legal (Art. GDPR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-2 pr-4">Crearea și gestionarea contului</td>
                    <td className="py-2">Art. 6(1)(b) — executarea contractului</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Procesarea plăților și abonamentelor</td>
                    <td className="py-2">Art. 6(1)(b) — executarea contractului</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Verificarea vârstei (18+)</td>
                    <td className="py-2">Art. 6(1)(c) — obligație legală</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Comunicări despre serviciu</td>
                    <td className="py-2">Art. 6(1)(f) — interes legitim</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Prevenirea fraudei și securitate</td>
                    <td className="py-2">Art. 6(1)(f) — interes legitim</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Îmbunătățirea serviciului</td>
                    <td className="py-2">Art. 6(1)(f) — interes legitim</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Comunicări de marketing</td>
                    <td className="py-2">Art. 6(1)(a) — consimțământ</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. Partajarea datelor</h2>
              <p>Datele dumneavoastră pot fi partajate cu:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>
                  <strong className="text-white">Firebase / Google Cloud</strong> — pentru autentificare
                  și stocarea datelor (sediul: UE/SUA, cu clauze contractuale standard);
                </li>
                <li>
                  <strong className="text-white">Stripe</strong> — pentru procesarea plăților
                  (certificat PCI DSS Level 1);
                </li>
                <li>
                  <strong className="text-white">Google reCAPTCHA</strong> — pentru prevenirea abuzului
                  automatizat (se aplică{" "}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Politica de confidențialitate Google
                  </a>);
                </li>
              </ul>
              <p className="mt-3">
                Nu vindem, nu închiriem și nu partajăm datele dumneavoastră personale cu terți în
                scopuri de marketing fără consimțământul dumneavoastră explicit.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. Transferul datelor în afara SEE</h2>
              <p>
                Unii dintre furnizorii noștri de servicii pot prelucra date în afara Spațiului Economic
                European (SEE). În aceste cazuri, asigurăm un nivel adecvat de protecție prin:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Clauze contractuale standard aprobate de Comisia Europeană;</li>
                <li>Cadrul UE-SUA privind protecția datelor (Data Privacy Framework);</li>
                <li>Decizii de adecvare ale Comisiei Europene, unde sunt aplicabile.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Perioada de stocare a datelor</h2>
              <ul className="list-disc list-inside space-y-1">
                <li><strong className="text-white">Date de cont:</strong> pe durata existenței contului + 30 de zile după ștergere;</li>
                <li><strong className="text-white">Date financiare:</strong> 10 ani conform legislației fiscale din România;</li>
                <li><strong className="text-white">Log-uri de securitate:</strong> 12 luni;</li>
                <li><strong className="text-white">Date de analiză (anonimizate):</strong> nelimitat.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Drepturile dumneavoastră (conform GDPR)</h2>
              <p>În calitate de persoană vizată, aveți următoarele drepturi:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li><strong className="text-white">Dreptul de acces</strong> (Art. 15) — să solicitați o copie a datelor dumneavoastră personale;</li>
                <li><strong className="text-white">Dreptul la rectificare</strong> (Art. 16) — să corectați datele inexacte;</li>
                <li><strong className="text-white">Dreptul la ștergere</strong> (Art. 17) — &quot;dreptul de a fi uitat&quot;;</li>
                <li><strong className="text-white">Dreptul la restricționarea prelucrării</strong> (Art. 18);</li>
                <li><strong className="text-white">Dreptul la portabilitatea datelor</strong> (Art. 20) — să primiți datele într-un format structurat;</li>
                <li><strong className="text-white">Dreptul la opoziție</strong> (Art. 21) — să vă opuneți prelucrării;</li>
                <li><strong className="text-white">Dreptul de a nu fi supus deciziilor automatizate</strong> (Art. 22);</li>
                <li><strong className="text-white">Dreptul de a retrage consimțământul</strong> — oricând, fără a afecta legalitatea prelucrării anterioare.</li>
              </ul>
              <p className="mt-3">
                Pentru exercitarea acestor drepturi, contactați-ne la <strong className="text-white">contact@ggai.bet</strong>.
                Vom răspunde în termen de 30 de zile calendaristice.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">9. Plângeri</h2>
              <p>
                Dacă considerați că prelucrarea datelor dumneavoastră personale încalcă GDPR, aveți
                dreptul de a depune o plângere la:
              </p>
              <ul className="list-none space-y-1 mt-2">
                <li><strong className="text-white">Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)</strong></li>
                <li>Website: <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.dataprotection.ro</a></li>
                <li>Email: anspdcp@dataprotection.ro</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">10. Cookie-uri și tehnologii similare</h2>
              <p>Platforma utilizează:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li><strong className="text-white">Cookie-uri esențiale:</strong> necesare pentru funcționarea platformei (autentificare, sesiune);</li>
                <li><strong className="text-white">Cookie-uri funcționale:</strong> pentru memorarea preferințelor;</li>
                <li><strong className="text-white">Cookie-uri analitice:</strong> pentru înțelegerea modului de utilizare a platformei.</li>
              </ul>
              <p className="mt-3">
                Puteți gestiona preferințele de cookie-uri din setările browserului dumneavoastră.
                Dezactivarea cookie-urilor esențiale poate afecta funcționarea platformei.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">11. Securitatea datelor</h2>
              <p>Implementăm măsuri tehnice și organizatorice adecvate pentru protejarea datelor, inclusiv:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Criptare în tranzit (TLS/SSL) și în repaus;</li>
                <li>Hashing-ul parolelor cu algoritmi securizați;</li>
                <li>Acces restricționat pe baza principiului necesității de a cunoaște;</li>
                <li>Monitorizare continuă și audituri de securitate;</li>
                <li>Backup-uri regulate și proceduri de recuperare în caz de dezastru.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">12. Minori</h2>
              <p>
                Platforma nu este destinată persoanelor sub 18 ani. Nu colectăm cu bună știință
                date personale de la minori. Dacă descoperim că am colectat date ale unui minor,
                le vom șterge imediat.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">13. Modificarea politicii</h2>
              <p>
                Ne rezervăm dreptul de a modifica această politică de confidențialitate. Orice
                modificări semnificative vor fi comunicate prin email sau prin notificări pe
                Platformă. Vă încurajăm să consultați periodic această pagină.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">14. Contact</h2>
              <p>
                Pentru orice întrebări sau solicitări legate de protecția datelor personale:
              </p>
              <ul className="list-none space-y-1 mt-2">
                <li>📧 Email general: contact@ggai.bet</li>
                <li>🔒 Responsabil protecția datelor: contact@ggai.bet</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
