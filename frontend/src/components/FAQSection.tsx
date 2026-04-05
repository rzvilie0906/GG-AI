"use client";

import { useState } from "react";

const faqItems = [
  {
    q: "Ce sporturi acoperă GG-AI?",
    a: "Acoperim 5 sporturi: fotbal (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League și altele), baschet (NBA), hochei (NHL), tenis (ATP, WTA) și baseball (MLB). În fiecare zi primești 4 bilete — unul mixt cu meciuri din mai multe sporturi, plus câte unul dedicat pentru fotbal, baschet și hochei."
  },
  {
    q: "Cum sunt generate biletele zilnice?",
    a: "Totul e automat. În fiecare dimineață la 09:00, sistemul nostru adună meciurile din următoarele 7 zile și cotele de la casele de pariuri. Apoi, AI-ul (GPT-4o) trece prin fiecare meci — formă recentă, clasament, meciuri directe, accidentări — și alege 2–4 meciuri cu valoare reală. Rezultatul? 4 bilete gata de jucat, disponibile în dashboard de la 10:00, fiecare cu pariuri recomandate, intervale de cote și explicații clare."
  },
  {
    q: "Ce include analiza fiecărui meci?",
    a: "Primești tot ce ai nevoie ca să iei o decizie informată: un pariu principal (recomandarea #1), un pariu secundar (alternativă cu alt profil de risc), intervalul de cote la care merită plasat pariul, probabilitatea estimată de AI, un scor de încredere de la 1 la 10, și o explicație detaliată — de ce a ales AI-ul exact acel pariu, ce statistici l-au convins și ce factori ar putea influența rezultatul."
  },
  {
    q: "Ce este Analizorul de Risc al Biletului?",
    a: "E ca și cum ai avea un consultant alături. Adaugi meciurile tale pe bilet în dashboard, iar AI-ul evaluează biletul în ansamblu — nu doar fiecare meci separat. Primești un scor de risc total, un verdict clar și sfaturi concrete: \u201Ecota pe meciul X e prea mare, încearcă alternativa Y\u201D. Disponibil în planurile Pro (max 7 verificări/zi) și Elite (nelimitat)."
  },
  {
    q: "Pot anula abonamentul oricând?",
    a: "Da, fără nicio problemă. Intri în secțiunea \u201EContul meu\u201D din dashboard, apeși anulare și gata. Fără contracte, fără penalități, fără întrebări. După anulare, păstrezi accesul la tot până la sfârșitul perioadei plătite."
  },
  {
    q: "Care este diferența dintre planuri?",
    a: "Săptămânal (14.99€/săptămână) — perfect ca să testezi: 4 bilete zilnice, până la 7 analize de meciuri pe zi, pariuri principale + secundare și calendar pe 7 zile. Pro (39.99€/lună) — cel mai popular: totul din Săptămânal, plus analize nelimitate și Analizor de Risc (max 7 bilete/zi). Elite (99.99€/lună) — fără nicio limită: totul din Pro, plus Analizor de Risc nelimitat, procesare prioritară și suport dedicat."
  },
  {
    q: "Plata este sigură?",
    a: "100%. Plățile trec prin Stripe — lider mondial în procesarea plăților, cu certificare PCI-DSS Level 1 (cel mai înalt standard de securitate). Datele cardului tău nu ajung niciodată pe serverele noastre — nici numărul, nici CVV-ul. Totul rămâne la Stripe, iar comunicarea e criptată end-to-end cu SSL 256-bit."
  },
  {
    q: "Cum îmi fac cont?",
    a: "Poți alege între email + parolă sau direct cu contul Google. E nevoie de nume complet, data nașterii și vârsta minimă de 18 ani (cerință legală). Vei primi un email de confirmare — odată verificat, alegi un plan și ai acces instant la dashboard."
  },
  {
    q: "GG-AI garantează câștiguri?",
    a: "Sincer, nu — și nimeni nu poate. Pariurile sportive implică risc prin natura lor, iar orice serviciu care promite câștiguri garantate nu e de încredere. Ce oferim noi e un avantaj informațional real: analiză bazată pe date, identificarea cotelor subevaluate și evaluarea riscului. AI-ul face munca grea, dar decizia finală e întotdeauna a ta. Pariază doar ce îți permiți să pierzi."
  },
  {
    q: "Funcționează pe telefon?",
    a: "Da, fără nicio aplicație de instalat. Deschizi site-ul din browser-ul telefonului și ai acces la tot — bilete, analize, ticket builder, analizor de risc. Interfața e optimizată pentru mobile, tabletă și desktop."
  },
  {
    q: "Când primesc biletele zilnice?",
    a: "Meciurile se sincronizează în fiecare dimineață la 09:00 (ora României), iar biletele AI sunt gata la 10:00. Primești 4 bilete proaspete zilnic: mixt, fotbal, baschet și hochei. Simplu — deschizi dashboard-ul după 10 și ai tot ce-ți trebuie."
  },
  {
    q: "Am o problemă sau o întrebare. Ce fac?",
    a: "Scrie-ne prin formularul de contact sau pe email. Răspundem de obicei în mai puțin de 24 de ore. Dacă ai plan Elite, beneficiezi de suport prioritar — mesajele tale ajung primele."
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
