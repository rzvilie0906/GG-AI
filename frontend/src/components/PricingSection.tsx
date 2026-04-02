"use client";

import { useState } from "react";
import Link from "next/link";

const PRICE_WEEKLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_WEEKLY || "";
const PRICE_PRO_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "";
const PRICE_PRO_YEARLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || "";
const PRICE_ELITE_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY || "";
const PRICE_ELITE_YEARLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_YEARLY || "";

interface PricingSectionProps {
  isLoggedIn: boolean;
  isActive: boolean;
}

export default function PricingSection({ isLoggedIn, isActive }: PricingSectionProps) {
  const [proAnnual, setProAnnual] = useState(false);
  const [eliteAnnual, setEliteAnnual] = useState(false);

  function checkoutLink(priceId: string) {
    if (isLoggedIn && isActive) return "/dashboard";
    if (isLoggedIn) return `/pricing?priceId=${priceId}`;
    return `/auth/signin?priceId=${priceId}`;
  }

  return (
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
              {proAnnual && <div className="lp-pricing-save">🎉 Economisești 80€ — doar 33.33€/lună!</div>}
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
              {eliteAnnual && <div className="lp-pricing-save">🎉 Economisești 200€ — doar 83.33€/lună!</div>}
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
  );
}
