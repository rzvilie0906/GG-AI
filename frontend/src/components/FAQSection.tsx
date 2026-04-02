"use client";

import { useState } from "react";

const faqItems = [
  {
    q: "Ce sporturi acoperă GG-AI?",
    a: "GG-AI analizează zilnic meciuri din 5 sporturi majore: fotbal (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League și multe altele), baschet (NBA, EuroLeague), hochei (NHL), tenis (ATP, WTA, Grand Slam) și baseball (MLB). Motorul AI generează 4 bilete zilnice — mixt (toate sporturile combinate), fotbal, baschet și hochei — selectând meciuri cu cote sub-evaluate pe baza analizei statistice avansate."
  },
  {
    q: "Cum sunt generate biletele zilnice?",
    a: "Procesul este complet automatizat. Zilnic la ora 09:00, scheduler-ul preia meciurile programate pe următoarele 7 zile și cotele de la bookmakers pe +2 zile prin API-uri specializate (ESPN pentru date statistice, The Odds API pentru cotele bookmaker-ilor). Apoi, GPT-4o analizează fiecare meci potențial — formă recentă, clasament, H2H, accidentări, condiții meteorologice — și selectează 2–4 meciuri cu cele mai bune value bets. Se generează 4 bilete structurate: mixt, fotbal, baschet și hochei, fiecare cu pariu principal, pariu secundar, interval de cote corecte și explicații detaliate. Biletele sunt disponibile în dashboard de la ora 10:00."
  },
  {
    q: "Ce include analiza fiecărui meci?",
    a: "Fiecare analiză AI conține: un pariu principal (recomandarea #1 cu probabilitatea cea mai mare de succes), un pariu secundar (alternativă cu raport risc/câștig diferit), intervale de cote corecte (minim și maxim la care merită plasat pariul), probabilitatea estimată de AI (procentul de probabilitate calculat de model), un rating de risc (etichetă Riscant sau Bun), un scor/notă de încredere de la 1 la 10, și o explicație detaliată care descrie logica din spatele predicției — formă recentă, statistici H2H, absențe, factori contextuali."
  },
  {
    q: "Ce este Analizorul de Risc al Biletului?",
    a: "Analizorul de Risc este o funcție avansată disponibilă în planurile Pro și Elite. Adaugi meciurile tale pe biletul personal din dashboard, iar AI-ul evaluează întregul bilet în ansamblu — nu doar meciul individual. Primești un scor de risc total, un verdict clar (Riscant/Medie/Bun), și sfaturi despre cum să îmbunătățești biletul (de exemplu: cota e prea mare pe meciul X, consideră alternativa Y). Planul Pro permite maxim 7 verificări de bilet pe zi, iar planul Elite oferă verificări nelimitate."
  },
  {
    q: "Pot anula abonamentul oricând?",
    a: "Da, absolut. Toate cele trei planuri — Săptămânal, Pro și Elite — pot fi anulate oricând direct din secțiunea Contul meu din dashboard. Nu există obligații pe termen lung, contracte minime sau taxe de anulare. Odată anulat, vei păstra accesul complet la toate funcționalitățile până la sfârșitul perioadei de facturare curente (sfârșitul săptămânii/lunii/anului plătit). Nu se oferă rambursări pentru perioada rămasă."
  },
  {
    q: "Care este diferența dintre planurile Săptămânal, Pro și Elite?",
    a: "Săptămânal (14.99€/săptămână) — ideal pentru a testa platforma: include 4 bilete zilnice generate AI, maximum 7 analize individuale de meciuri pe zi, pariu principal + secundar, interval de cote corecte și calendar meciuri pe 7 zile. Nu include Analizorul de Risc. Pro (39.99€/lună sau 399.99€/an) — cel mai popular: include tot din Săptămânal plus analize de meciuri nelimitate, Analizor Risc Bilet (maximum 7 bilete/zi), scoring premium și explicații mai detaliate. Elite (99.99€/lună sau 999.99€/an) — fără limite absolut: include tot din Pro plus Analizor Risc Bilet nelimitat, prioritate maximă la procesare, urmărire avansată a cotelor și suport prioritar 24/7."
  },
  {
    q: "Plata este sigură? Ce date stocați?",
    a: "Da, plățile sunt 100% securizate. Folosim Stripe ca procesor de plăți — cel mai de încredere la nivel mondial, certificat PCI-DSS Level 1 (cel mai înalt standard de securitate pentru carduri). Nu stocăm niciodată datele cardului tău pe serverele noastre — nici numărul cardului, nici CVV-ul, nici data de expirare. Toate informațiile financiare rămân exclusiv la Stripe. Comunicarea între browser-ul tău și serverele noastre este criptată end-to-end cu SSL/TLS 256-bit."
  },
  {
    q: "Cum se creează un cont și care sunt cerințele?",
    a: "Te poți înregistra cu email și parolă sau direct cu contul tău Google. La înregistrarea prin email, trebuie să furnizezi numele complet și data nașterii. Trebuie să ai minimum 18 ani pentru a te înregistra — aceasta este o cerință legală pentru serviciile legate de pariuri sportive. După crearea contului, vei primi un email de verificare pe care trebuie să-l confirmi înainte de a accesa platforma. Odată verificat, poți alege un plan de abonament și accesa dashboard-ul complet."
  },
  {
    q: "GG-AI garantează câștiguri?",
    a: "Nu. Niciun sistem, algoritm sau serviciu nu poate garanta câștiguri la pariuri sportive — și oricine pretinde altfel nu este onest. GG-AI este un instrument de analiză și suport decizional care îți oferă un avantaj informațional: date statistice procesate de AI, identificarea value bets, evaluarea riscului și recomandări bazate pe probabilități. Rezultatele sportive rămân impredictibile prin natura lor. Pariurile implică risc financiar real — pariază doar sume pe care ți le poți permite să le pierzi și joacă responsabil."
  },
  {
    q: "Pot accesa GG-AI de pe telefon?",
    a: "Da. Dashboard-ul GG-AI este complet responsive, optimizat pentru telefoane, tablete și desktop. Nu este nevoie să instalezi nicio aplicație — accesezi platforma direct din browser-ul mobil. Toate funcționalitățile — bilete zilnice, analize, ticket builder, analizor de risc — funcționează identic pe orice dispozitiv."
  },
  {
    q: "Când primesc biletele zilnice?",
    a: "Meciurile sunt sincronizate și actualizate zilnic la ora 09:00 (ora României). Biletele generate de AI sunt disponibile în dashboard de la ora 10:00. Primești 4 bilete noi în fiecare zi: un bilet mixt (combinație din toate sporturile), plus bilete separate pentru fotbal, baschet și hochei. Biletele se bazează pe meciurile programate în ziua respectivă și următoarele zile."
  },
  {
    q: "Ce se întâmplă dacă am probleme sau întrebări?",
    a: "Utilizatorii cu plan Elite beneficiază de suport prioritar 24/7. Pentru toți utilizatorii, poți trimite un mesaj prin formularul de contact sau prin email. Echipa noastră răspunde de obicei în mai puțin de 24 de ore pentru problemele tehnice sau întrebări legate de cont, facturare și funcționalități."
  },
];

export default function FAQSection() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <section className="lp-section lp-section-dark fade-in" id="faq">
      <div className="lp-container lp-container-narrow">
        <div className="lp-section-header">
          <span className="lp-section-badge lp-section-badge-purple">❓ Întrebări</span>
          <h2 className="lp-section-title">Întrebări frecvente</h2>
          <p className="lp-section-sub">Tot ce trebuie să știi despre GG-AI înainte de a începe.</p>
        </div>
        <div className="lp-faq-list">
          {faqItems.map((item, i) => (
            <div key={i} className={`lp-faq-item ${faqOpen === i ? "lp-faq-open" : ""}`}>
              <button className="lp-faq-question" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                <span>{item.q}</span>
                <svg className="lp-faq-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div className="lp-faq-answer"><p>{item.a}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
