"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import "./landing.css";

// ── Price IDs from env ──
const PRICE_WEEKLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_WEEKLY || "";
const PRICE_PRO_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "";
const PRICE_PRO_YEARLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || "";
const PRICE_ELITE_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY || "";
const PRICE_ELITE_YEARLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_YEARLY || "";

export default function LandingPage() {
  const { user, subscription, signOut } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);
  const [eliteAnnual, setEliteAnnual] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
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
          if (e.isIntersecting) e.target.classList.add("visible");
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function checkoutLink(priceId: string) {
    if (user && subscription?.status === "active") return "/dashboard";
    if (user) return `/pricing?priceId=${priceId}`;
    return `/auth/signin?priceId=${priceId}`;
  }

  const isLoggedIn = !!user;
  const isActive = subscription?.status === "active";

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
            <div className="lp-nav-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="lp-nav-title">GG-<span className="lp-badge-pro">AI</span></span>
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
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        Contul meu
                      </button>
                      <button onClick={() => { setProfileOpen(false); router.push("/pricing?upgrade=true"); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                        Upgrade plan
                      </button>
                      <button onClick={() => { setProfileOpen(false); router.push("/suport"); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        Suport
                      </button>
                    </div>
                    <div className="lp-profile-footer">
                      <button onClick={handleSignOut}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
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
            Pariuri mai inteligente,<br />
            alimentate de <span className="lp-gradient-text">inteligență artificială</span>
          </h1>
          <p className="lp-hero-sub">
            Analizăm zilnic zeci de meciuri din fotbal, baschet, hochei, tenis și baseball.
            Primești 4 bilete zilnice cu valoare, scoruri de încredere și sfaturi AI — totul înainte de fluierul de start.
          </p>
          <div className="lp-hero-ctas">
            <a href="#preturi" className="lp-btn lp-btn-primary lp-btn-lg">
              Vezi Planurile
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
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
                <h4>De ce funcționează?</h4>
                <p>AI-ul nu pariază pe instinct. Analizează statistici concrete: formă recentă, medie goluri, H2H, clasament, accidentări + cote de la casele de pariuri.</p>
              </div>
              <div className="lp-profit-info-card fade-in">
                <div className="lp-profit-info-icon">🎯</div>
                <h4>Selecție cu valoare</h4>
                <p>Fiecare meci este ales pentru că are cotă subevaluată — probabilitatea reală este mai mare decât ce oferă casele de pariuri.</p>
              </div>
              <div className="lp-profit-info-card fade-in">
                <div className="lp-profit-info-icon">⚠️</div>
                <h4>Disclaimer</h4>
                <p>Pariurile implică risc financiar. Niciun sistem nu garantează câștiguri 100%. Pariază responsabil. 18+.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="lp-section fade-in" id="preturi">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-badge lp-section-badge-gold">💰 Prețuri</span>
            <h2 className="lp-section-title">Alege planul potrivit</h2>
            <p className="lp-section-sub">Fără contracte pe termen lung. Anulezi oricând.</p>
          </div>
          <div className="lp-pricing-grid">
            {/* Săptămânal */}
            <div className="lp-pricing-card">
              <div className="lp-pricing-card-inner">
                <div className="lp-pricing-header"><h3>Săptămânal</h3><p>Ideal pentru a testa platforma</p></div>
                <div className="lp-pricing-price">
                  <span className="lp-price-amount">€14<span className="lp-price-decimals">.99</span></span>
                  <span className="lp-price-period">/săptămână</span>
                </div>
                <Link href={checkoutLink(PRICE_WEEKLY)} className="lp-btn lp-btn-outline lp-btn-block">Activează Săptămânal</Link>
                <div className="lp-pricing-divider" />
                <ul className="lp-pricing-features">
                  <li><span className="lp-check">✓</span> 4 bilete zilnice (mixt, fotbal, baschet, hochei)</li>
                  <li><span className="lp-check">✓</span> Maxim 7 analize meciuri / zi</li>
                  <li><span className="lp-check">✓</span> Pariu Principal + Secundar</li>
                  <li><span className="lp-check">✓</span> Interval de cote ajustat</li>
                  <li><span className="lp-check">✓</span> Calendar meciuri +7 zile</li>
                  <li><span className="lp-x-mark">✗</span> Fără Analizor Risc Bilet</li>
                </ul>
              </div>
            </div>

            {/* Pro */}
            <div className="lp-pricing-card lp-pricing-card-popular">
              <div className="lp-popular-ribbon">FAVORITUL PUBLICULUI</div>
              <div className="lp-pricing-card-inner">
                <div className="lp-pricing-header"><h3>Pro</h3><p>Acces complet cu analiză nelimitată de meciuri</p></div>
                <div className="lp-pricing-toggle">
                  <button className={!proAnnual ? "active" : ""} onClick={() => setProAnnual(false)}>Lunar</button>
                  <button className={proAnnual ? "active" : ""} onClick={() => setProAnnual(true)}>Anual</button>
                </div>
                <div className="lp-pricing-price">
                  <span className="lp-price-amount">€{proAnnual ? "399" : "39"}<span className="lp-price-decimals">.99</span></span>
                  <span className="lp-price-period">/{proAnnual ? "an" : "lună"}</span>
                </div>
                {proAnnual && <div className="lp-pricing-save">Economisești 80€ pe an</div>}
                <Link href={checkoutLink(proAnnual ? PRICE_PRO_YEARLY : PRICE_PRO_MONTHLY)} className="lp-btn lp-btn-primary lp-btn-block">Activează Pro</Link>
                <div className="lp-pricing-divider" />
                <ul className="lp-pricing-features">
                  <li><span className="lp-check lp-check-gold">★</span> 4 bilete zilnice (mixt, fotbal, baschet, hochei)</li>
                  <li><span className="lp-check lp-check-gold">★</span> Analize meciuri nelimitate</li>
                  <li><span className="lp-check lp-check-gold">★</span> Analizor Risc Bilet (maximum 7 bilete/zi)</li>
                  <li><span className="lp-check lp-check-gold">★</span> Pariu Principal + Secundar</li>
                  <li><span className="lp-check lp-check-gold">★</span> Scoring premium & explicații detaliate</li>
                  <li><span className="lp-check lp-check-gold">★</span> Calendar meciuri +7 zile</li>
                  <li><span className="lp-check lp-check-gold">★</span> Anulezi oricând — fără obligații</li>
                </ul>
              </div>
            </div>

            {/* Elite */}
            <div className="lp-pricing-card lp-pricing-card-best">
              <div className="lp-best-ribbon">CEL MAI BUN</div>
              <div className="lp-pricing-card-inner">
                <div className="lp-pricing-header"><h3>Elite</h3><p>Fără limite — pentru pariorii serioși</p></div>
                <div className="lp-pricing-toggle">
                  <button className={!eliteAnnual ? "active" : ""} onClick={() => setEliteAnnual(false)}>Lunar</button>
                  <button className={eliteAnnual ? "active" : ""} onClick={() => setEliteAnnual(true)}>Anual</button>
                </div>
                <div className="lp-pricing-price">
                  <span className="lp-price-amount">€{eliteAnnual ? "999" : "99"}<span className="lp-price-decimals">.99</span></span>
                  <span className="lp-price-period">/{eliteAnnual ? "an" : "lună"}</span>
                </div>
                {eliteAnnual && <div className="lp-pricing-save">Economisești 200€ pe an</div>}
                <Link href={checkoutLink(eliteAnnual ? PRICE_ELITE_YEARLY : PRICE_ELITE_MONTHLY)} className="lp-btn lp-btn-accent lp-btn-block">Activează Elite</Link>
                <div className="lp-pricing-divider" />
                <ul className="lp-pricing-features">
                  <li><span className="lp-check lp-check-diamond">💎</span> Tot ce include Pro</li>
                  <li><span className="lp-check lp-check-diamond">💎</span> Analize meciuri nelimitate</li>
                  <li><span className="lp-check lp-check-diamond">💎</span> Analizor Risc Bilet — nelimitat</li>
                  <li><span className="lp-check lp-check-diamond">💎</span> Prioritate maximă la procesare</li>
                  <li><span className="lp-check lp-check-diamond">💎</span> Urmărire avansată a cotelor</li>
                  <li><span className="lp-check lp-check-diamond">💎</span> Suport prioritar 24/7</li>
                  <li><span className="lp-check lp-check-diamond">💎</span> Anulezi oricând — fără obligații</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TABEL COMPARATIV ═══ */}
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
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="lp-section lp-section-dark fade-in" id="faq">
        <div className="lp-container lp-container-narrow">
          <div className="lp-section-header">
            <span className="lp-section-badge lp-section-badge-purple">❓ Întrebări</span>
            <h2 className="lp-section-title">Întrebări frecvente</h2>
            <p className="lp-section-sub">Tot ce trebuie să știi despre GG-AI înainte de a începe.</p>
          </div>
          <div className="lp-faq-list">
            {[
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
            ].map((item, i) => (
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

      {/* ═══ FINAL CTA ═══ */}
      <section className="lp-final-cta fade-in">
        <div className="lp-container lp-final-cta-inner">
          <h2>Pregătit să pariezi mai inteligent?</h2>
          <p>Alătură-te GG-AI astăzi și primește analize AI zilnice livrate înainte de fiecare meci.</p>
          <div className="lp-final-cta-buttons">
            <a href="#preturi" className="lp-btn lp-btn-primary lp-btn-lg">
              Începe Acum
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
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
              <div className="lp-nav-logo">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <span className="lp-nav-title">GG-<span className="lp-badge-pro">AI</span></span>
            </Link>
            <p>Analizator AI de pariuri sportive. Selecții zilnice cu valoare, bilete inteligente și scoruri de încredere.</p>
          </div>
          <div className="lp-footer-col">
            <h4>Produs</h4>
            <a href="#beneficii">Beneficii</a>
            <a href="#cum-functioneaza">Cum Funcționează</a>
            <a href="#profit">Exemplu Profit</a>
            <a href="#preturi">Prețuri</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-footer-col">
            <h4>Legal</h4>
            <Link href="/confidentialitate">Politica de Confidențialitate</Link>
            <Link href="/termeni">Termeni și Condiții</Link>
            <Link href="/joc-responsabil">Joc Responsabil</Link>
          </div>
        </div>
        <div className="lp-container lp-footer-bottom">
          <span>© 2026 GG-AI. Toate drepturile rezervate.</span>
          <span>Pariurile implică risc. Pariază responsabil. 18+.</span>
        </div>
      </footer>
    </div>
  );
}
