"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export default function SuportPage() {
  const { user, getIdToken } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Adresa de email este obligatorie.");
      return;
    }
    if (!message.trim()) {
      setError("Mesajul este obligatoriu.");
      return;
    }

    setSending(true);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append("email", email.trim());
      formData.append("message", message.trim());
      if (attachment) {
        formData.append("attachment", attachment);
      }

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/support/ticket`, {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Eroare la trimiterea cererii.");
      }

      setSuccess("Cererea ta a fost trimisă cu succes! Vei fi contactat în cel mai scurt timp.");
      setMessage("");
      setAttachment(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare necunoscută.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--bg-deep)" }}>
      <div className="mesh-bg" />
      <div className="noise-overlay" />

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition mb-6"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Înapoi la Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-violet flex items-center justify-center mx-auto mb-4 shadow-glow">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Suport</h1>
          <p className="text-text-secondary">Ai nevoie de ajutor? Suntem aici pentru tine.</p>
        </div>

        {/* Legal Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <Link
            href="/termeni"
            className="card p-5 flex items-center gap-4 hover:border-primary/30 transition group"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Termeni și Condiții</h3>
              <p className="text-text-muted text-xs mt-0.5">Citește termenii de utilizare</p>
            </div>
          </Link>

          <Link
            href="/confidentialitate"
            className="card p-5 flex items-center gap-4 hover:border-primary/30 transition group"
          >
            <div className="w-10 h-10 rounded-xl bg-violet/10 flex items-center justify-center flex-shrink-0 group-hover:bg-violet/20 transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Politica de Confidențialitate</h3>
              <p className="text-text-muted text-xs mt-0.5">Cum protejăm datele tale</p>
            </div>
          </Link>
        </div>

        {/* Contact Form */}
        <div className="card p-6 md:p-8">
          <h2 className="text-xl font-bold text-white mb-2">Trimite o cerere</h2>
          <p className="text-text-secondary text-sm mb-6">
            Completează formularul de mai jos și echipa noastră te va contacta.
          </p>

          {/* Priority notice */}
          <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
            <div className="flex items-start gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p className="text-text-secondary text-sm leading-relaxed">
                Cererile sunt procesate în funcție de <span className="text-white font-medium">prioritatea planului</span> (Elite → Pro → Weekly) și de <span className="text-white font-medium">ordinea cronologică</span> a trimiterii. Vom răspunde în cel mai scurt timp posibil.
              </p>
            </div>
          </div>

          {success && (
            <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
              {success}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Email de contact</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field w-full"
                placeholder="email@exemplu.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Mesaj</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="input-field w-full resize-none"
                placeholder="Descrie problema sau întrebarea ta cât mai detaliat..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Atașament <span className="text-text-muted">(opțional — captură de ecran, document etc.)</span>
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  className="hidden"
                  id="attachment-input"
                />
                <label
                  htmlFor="attachment-input"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-text-secondary cursor-pointer transition"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span className="text-sm truncate">
                    {attachment ? attachment.name : "Alege un fișier..."}
                  </span>
                </label>
                {attachment && (
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-danger transition"
                    title="Elimină fișierul"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={sending}
              className="btn btn-primary w-full py-3 text-base font-semibold disabled:opacity-50"
            >
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Se trimite...
                </span>
              ) : (
                "Trimite cererea"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
