"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/AuthContext";
import "./landing.css";

const PricingSection = dynamic(() => import("@/components/PricingSection"), {
  loading: () => <div style={{ minHeight: 600 }} />,
});
const ComparisonTable = dynamic(() => import("@/components/ComparisonTable"), {
  loading: () => <div style={{ minHeight: 400 }} />,
});
const FAQSection = dynamic(() => import("@/components/FAQSection"), {
  loading: () => <div style={{ minHeight: 500 }} />,
});

export default function LandingPage() {
  const { user, subscription, signOut } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    function observeAll() {
      document.querySelectorAll(".fade-in:not(.visible)").forEach((el) => observer.observe(el));
    }
    observeAll();
    // Re-observe after dynamic imports settle
    const timer = setTimeout(observeAll, 1000);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);

  function checkoutLink(priceId: string) {
    if (user && subscription?.has_access) return "/dashboard";
    if (user) return `/pricing?priceId=${priceId}`;
    return `/auth/signin?priceId=${priceId}`;
  }

  const isLoggedIn = !!user;
  const isActive = !!subscription?.has_access;

  const userEmail = user?.email;
  const userName = user?.displayName;
  const initials = userName
    ? userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : userEmail
    ? userEmail.charAt(0).toUpperCase()
    : "?";

  function handleSignOut() {
    setProfileOpen(false);
    router.push("/");
    signOut();
  }

  return (
    <div className="landing-page">

      {/* ═══ NAVBAR ═══ */}
      <nav className={`lp-navbar ${scrolled ? "lp-navbar-scrolled" : ""}`}>
        <div className="lp-container lp-nav-inner">
          <Link href="/" className="lp-nav-brand">
            <Image src="/logo.png" alt="GG-AI" width={160} height={160} className="lp-nav-logo-img" priority />
          </Link>
          <div className={`lp-nav-links ${mobileMenu ? "lp-nav-links-open" : ""}`}>
            <a href="#beneficii">Beneficii</a>
            <a href="#cum-functioneaza">Cum Funcționează</a>
            <a href="#profit">Exemplu Profit</a>
            <a href="#preturi">Prețuri</a>
            <a href="#faq">FAQ</a>
            {isLoggedIn && isActive ? (
              <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-sm">Dashboard</Link>
            ) : isLoggedIn ? (
              <Link href="/pricing" className="lp-btn lp-btn-primary lp-btn-sm">Alege Plan</Link>
            ) : (
              <>
                <Link href="/auth/signin" className="lp-btn lp-btn-outline lp-btn-sm">Autentificare</Link>
                <Link href="/auth/signup" className="lp-btn lp-btn-primary lp-btn-sm">Începe Acum</Link>
              </>
            )}
            {isLoggedIn && (
              <div className="lp-profile-wrapper" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="lp-profile-avatar"
                  title={userEmail || ""}
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                  aria-label="Meniu profil"
                >
                  {initials}
                </button>
                {profileOpen && (
                  <div className="lp-profile-dropdown">
                    <div className="lp-profile-header">
                      {userName && <p className="lp-profile-name">{userName}</p>}
                      <p className="lp-profile-email">{userEmail}</p>
                    </div>
                    <div className="lp-profile-menu">
                      <button onClick={() => { setProfileOpen(false); router.push("/account"); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        Contul meu
                      </button>
                      <button onClick={() => { setProfileOpen(false); router.push("/pricing?upgrade=true"); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                        Upgrade plan
                      </button>
                      <button onClick={() => { setProfileOpen(false); router.push("/suport"); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        Suport
                      </button>
                    </div>
                    <div className="lp-profile-footer">
                      <button onClick={handleSignOut}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                        Deconectare
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="lp-nav-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Meniu">
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="lp-hero">
        <div className="lp-hero-bg">
          <div className="lp-hero-orb lp-hero-orb-1" />
          <div className="lp-hero-orb lp-hero-orb-2" />
        </div>
        <div className="lp-container lp-hero-content">
          <div className="lp-hero-badge">
            <span className="lp-pulse-dot" />
            Meciuri actualizate zilnic la 09:00 · Bilete noi de la 10:00
          </div>
          <h1 className="lp-hero-h1">
            <span className="lp-gradient-text">GG-AI</span> — Pariuri mai inteligente,<br />
            alimentate de inteligență artificială
          </h1>
          <p className="lp-hero-sub">
            Analizăm zilnic zeci de meciuri din fotbal, baschet, hochei, tenis și baseball.
            Primești 4 bilete zilnice cu valoare, scoruri de încredere și sfaturi AI — totul înainte de fluierul de start.
          </p>
          <div className="lp-hero-ctas">
            <a href="#preturi" className="lp-btn lp-btn-primary lp-btn-lg">
              Vezi Planurile
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </a>
            <a href="#cum-functioneaza" className="lp-btn lp-btn-outline lp-btn-lg">Cum Funcționează</a>
          </div>
          <div className="lp-hero-stats">
            {[
              { num: "5", label: "Sporturi Acoperite" },
              { num: "4", label: "Bilete Zilnice" },
              { num: "09:00", label: "Actualizare Meciuri" },
              { num: "10:00", label: "Bilete Noi Zilnic" },
            ].map((s, i) => (
              <div key={i} className="lp-hero-stat">
                <span className="lp-hero-stat-num">{s.num}</span>
                <span className="lp-hero-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF ═══ */}
      <section className="lp-social-proof">
        <div className="lp-container">
          <div className="lp-proof-bar">
            {[
              { icon: "⚡", title: "Analiză în timp real", desc: "Date live de la ESPN & odds API" },
              { icon: "🤖", title: "Powered by GPT-4o", desc: "Cel mai avansat model AI" },
              { icon: "🎯", title: "4 bilete zilnice", desc: "Mixt, fotbal, baschet, hochei" },
              { icon: "💳", title: "Plăți securizate Stripe", desc: "PCI-DSS Level 1" },
            ].map((p, i) => (
              <div key={i} className="lp-proof-item">
                <span className="lp-proof-icon">{p.icon}</span>
                <div>
                  <strong>{p.title}</strong>
                  <span>{p.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ BENEFICII ═══ */}
      <section className="lp-section fade-in" id="beneficii">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-badge">🏆 Beneficii</span>
            <h2 className="lp-section-title">De ce să alegi GG-AI?</h2>
            <p className="lp-section-sub">Toate uneltele de care ai nevoie pentru pariuri inteligente, într-o singură platformă.</p>
          </div>
          <div className="lp-benefits-grid">
            {[
              { icon: "📊", title: "Analiză AI Avansată", desc: "GPT-4o analizează fiecare meci cu date live: formă, H2H, accidentări, cote." },
              { icon: "🎯", title: "4 Bilete Zilnice", desc: "Bilete generate automat: mixt, fotbal, baschet și hochei — disponibile de la 10:00." },
              { icon: "📈", title: "Cote Corecte", desc: "Intervale de cote calculate matematic. Identifică value bets vs. cote supraevaluate." },
              { icon: "🛡️", title: "Analizor Risc Bilet", desc: "Verifică-ți biletul înainte să pariezi. AI-ul evaluează riscul total." },
              { icon: "⏰", title: "Actualizări Zilnice", desc: "Meciuri sincronizate la 09:00. Bilete noi la 10:00. Date fresh, mereu." },
              { icon: "🌍", title: "5 Sporturi", desc: "Fotbal, baschet, hochei, tenis și baseball. Calendar pe 7 zile în avans." },
            ].map((b, i) => (
              <div key={i} className="lp-benefit-card fade-in">
                <div className="lp-benefit-icon">{b.icon}</div>
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CUM FUNCȚIONEAZĂ ═══ */}
      <section className="lp-section lp-section-dark fade-in" id="cum-functioneaza">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-badge lp-section-badge-blue">🔧 Proces</span>
            <h2 className="lp-section-title">Cum Funcționează</h2>
            <p className="lp-section-sub">De la analiză la bilet câștigător — în 3 pași simpli.</p>
          </div>
          <div className="lp-steps-grid">
            {[
              { step: "01", icon: "🔍", title: "AI-ul Analizează Meciurile", desc: "Zilnic la ora 09:00, motorul nostru preia meciurile pe următoarele 7 zile și cotele pe +2 zile. Analizează forma, clasamentul, H2H și accidentările." },
              { step: "02", icon: "🎫", title: "Primești Biletele", desc: "Patru bilete zilnice cu 2–4 meciuri selectate: mixt, fotbal, baschet și hochei — disponibile zilnic de la 10:00. Fiecare meci are pariu principal, secundar și intervale de cote." },
              { step: "03", icon: "🏆", title: "Construiești Biletul & Câștigi", desc: "Adaugă meciuri pe biletul tău personal, primești scor de încredere AI, rating Riscant/Bun și explicații detaliate." },
            ].map((s, i) => (
              <div key={i} className="lp-step-card fade-in">
                <div className="lp-step-num">{s.step}</div>
                <div className="lp-step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ EXEMPLU PROFIT ═══ */}
      <section className="lp-section fade-in" id="profit">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-badge lp-section-badge-gold">💰 Exemplu Real</span>
            <h2 className="lp-section-title">Cum arată un bilet GG-AI câștigător</h2>
            <p className="lp-section-sub">Simulare bazată pe biletele generate de AI — cu meciuri reale din fotbal, baschet, hochei, tenis &amp; baseball.</p>
          </div>
          <div className="lp-profit-showcase">
            <div className="lp-profit-ticket">
              <div className="lp-profit-ticket-header">
                <span>🎫 BILETUL ZILEI — Mixt</span>
                <span className="lp-profit-ticket-date">Exemplu Simulare</span>
              </div>
              {[
                { sport: "⚽", team: "Barcelona vs Atletico Madrid", league: "La Liga · Pariu: Peste 2.5 goluri", odds: "1.75" },
                { sport: "🏀", team: "Lakers vs Celtics", league: "NBA · Pariu: Peste 215.5 puncte", odds: "1.85" },
                { sport: "🏒", team: "Toronto vs Montreal", league: "NHL · Pariu: 1 (victorie gazdă)", odds: "1.90" },
              ].map((m, i) => (
                <div key={i} className="lp-profit-match">
                  <div className="lp-profit-match-info">
                    <span className="lp-profit-sport-tag">{m.sport}</span>
                    <div>
                      <strong>{m.team}</strong>
                      <span>{m.league}</span>
                    </div>
                  </div>
                  <div className="lp-profit-odds">{m.odds}</div>
                </div>
              ))}
              <div className="lp-profit-footer">
                <div className="lp-profit-row"><span>Miză:</span><strong>50 €</strong></div>
                <div className="lp-profit-row"><span>Cotă totală:</span><strong className="lp-accent-text">5.98</strong></div>
                <div className="lp-profit-row lp-profit-row-big"><span>Câștig potențial:</span><strong className="lp-success-text">299.06 €</strong></div>
              </div>
            </div>
            <div className="lp-profit-side">
              <div className="lp-profit-info-card fade-in">
                <div className="lp-profit-info-icon">📈</div>
                <h3>De ce funcționează?</h3>
                <p>AI-ul nu pariază pe instinct. Analizează statistici concrete: formă recentă, medie goluri, H2H, clasament, accidentări + cote de la casele de pariuri.</p>
              </div>
              <div className="lp-profit-info-card fade-in">
                <div className="lp-profit-info-icon">🎯</div>
                <h3>Selecție cu valoare</h3>
                <p>Fiecare meci este ales pentru că are cotă subevaluată — probabilitatea reală este mai mare decât ce oferă casele de pariuri.</p>
              </div>
              <div className="lp-profit-info-card fade-in">
                <div className="lp-profit-info-icon">⚠️</div>
                <h3>Disclaimer</h3>
                <p>Pariurile implică risc financiar. Niciun sistem nu garantează câștiguri 100%. Pariază responsabil. 18+.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PricingSection isLoggedIn={isLoggedIn} isActive={isActive} />

      <ComparisonTable />

      {/* ═══ SECURITATE ═══ */}
      <section className="lp-section fade-in">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-badge lp-section-badge-green">🔐 Securitate</span>
            <h2 className="lp-section-title">Datele tale sunt protejate</h2>
            <p className="lp-section-sub">Folosim tehnologii de nivel bancar pentru plăți și protecția datelor.</p>
          </div>
          <div className="lp-security-grid">
            {[
              { icon: "🔒", title: "Criptare SSL 256-bit", desc: "Toată comunicarea este criptată end-to-end cu certificate SSL de nivel enterprise." },
              { icon: "💳", title: "Stripe — PCI DSS Level 1", desc: "Plățile sunt procesate prin Stripe, cel mai înalt standard de securitate pentru carduri." },
              { icon: "🚫", title: "Nu Stocăm Date Card", desc: "Datele cardului tău nu ajung niciodată pe serverele noastre. Totul rămâne la Stripe." },
              { icon: "❌", title: "Anulare Instant", desc: "Poți anula abonamentul din dashboard cu un singur click, fără penalități sau întrebări." },
            ].map((s, i) => (
              <div key={i} className="lp-security-card fade-in">
                <div className="lp-security-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FAQSection />

      {/* ═══ FINAL CTA ═══ */}
      <section className="lp-final-cta fade-in">
        <div className="lp-container lp-final-cta-inner">
          <h2>Pregătit să pariezi mai inteligent?</h2>
          <p>Alătură-te GG-AI (GGAI) astăzi pe ggai.bet și primește analize AI zilnice pentru pariuri sportive, livrate înainte de fiecare meci.</p>
          <div className="lp-final-cta-buttons">
            <a href="#preturi" className="lp-btn lp-btn-primary lp-btn-lg">
              Începe Acum
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </a>
            {isLoggedIn && isActive ? (
              <Link href="/dashboard" className="lp-btn lp-btn-outline lp-btn-lg">Dashboard</Link>
            ) : (
              <Link href="/auth/signin" className="lp-btn lp-btn-outline lp-btn-lg">Autentificare</Link>
            )}
          </div>
          <p className="lp-final-disclaimer">Pariurile implică risc financiar. Pariază responsabil. 18+.</p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <Link href="/" className="lp-nav-brand">
              <Image src="/logo.png" alt="GG-AI" width={160} height={160} className="lp-nav-logo-img" loading="lazy" />
            </Link>
            <p>GGAI (GG-AI) — analize AI zilnice pentru pariuri sportive pe ggai.bet. Selecții cu valoare, bilete inteligente și scoruri de încredere. Caută gg-ai bet sau ggai bet pentru a ne găsi.</p>
          </div>
          <div className="lp-footer-col">
            <h3>Produs</h3>
            <Link href="/pricing">Prețuri & Planuri</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/suport">Suport & Contact</Link>
            <Link href="/auth/signup">Creează un cont</Link>
            <Link href="/auth/signin">Autentificare</Link>
            <a href="#beneficii">Beneficii</a>
            <a href="#cum-functioneaza">Cum Funcționează</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-footer-col">
            <h3>Legal</h3>
            <Link href="/confidentialitate">Politica de Confidențialitate</Link>
            <Link href="/termeni">Termeni și Condiții</Link>
            <Link href="/joc-responsabil">Joc Responsabil</Link>
          </div>
          <div className="lp-footer-col">
            <h3>Resurse</h3>
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer">Plăți prin Stripe</a>
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer">BeGambleAware.org</a>
            <a href="https://www.gamblingtherapy.org/en" target="_blank" rel="noopener noreferrer">GamblingTherapy.org</a>
          </div>
        </div>
        <div className="lp-container lp-footer-bottom">
          <span>© 2026 GG-AI (GGAI) · ggai.bet — Toate drepturile rezervate.</span>
          <span>Pariurile implică risc. Pariază responsabil. 18+.</span>
        </div>
      </footer>
    </div>
  );
}
