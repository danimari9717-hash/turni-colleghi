"use client";

import { useState } from "react";
import { signOut } from "@/app/login/actions";
import type { Profile } from "@/types/database";
import Link from "next/link";

interface HeaderProps {
  profile: Pick<Profile, "nome" | "email" | "role"> | null;
}

export default function Header({ profile }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = profile?.nome || profile?.email || "Utente";
  const isAdmin = profile?.role === "admin";

  return (
    <header className="safe-top border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Riga principale: logo + (desktop nav | mobile hamburger) */}
        <div className="flex h-14 items-center justify-between">
          {/* Logo + badge (sempre visibile) */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent/5">
              <span className="font-mono text-sm font-bold text-accent">T</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-fg">
              Turni
            </span>
            {profile && (
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider ${
                  isAdmin ? "badge-admin" : "badge-employee"
                }`}
              >
                {isAdmin ? "admin" : "employee"}
              </span>
            )}
          </div>

          {/* Desktop: nav inline (≥640px) */}
          <div className="hidden items-center gap-4 sm:flex">
            <Link
              href="/classifica"
              className="font-mono text-sm text-fg-muted transition hover:text-accent"
            >
              Classifica
            </Link>
            {isAdmin && (
              <Link
                href="/utenti"
                className="font-mono text-sm text-fg-muted transition hover:text-accent"
              >
                Utenti
              </Link>
            )}
            {profile && (
              <span
                className="font-mono text-sm text-fg-muted"
                title={profile.email}
              >
                {displayName}
              </span>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="btn-ghost px-3 py-1.5 text-sm font-medium"
              >
                Esci
              </button>
            </form>
          </div>

          {/* Mobile: hamburger (≤640px) */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-fg-muted transition hover:text-fg sm:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile: menu a tendina */}
        {menuOpen && (
          <div className="animate-fade-in border-t border-border py-3 sm:hidden">
            <div className="space-y-1">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="block rounded-md px-3 py-2 font-mono text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
              >
                Calendario
              </Link>
              <Link
                href="/classifica"
                onClick={() => setMenuOpen(false)}
                className="block rounded-md px-3 py-2 font-mono text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
              >
                Classifica
              </Link>
              {isAdmin && (
                <Link
                  href="/utenti"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2 font-mono text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  Gestione utenti
                </Link>
              )}
              {profile && (
                <div className="px-3 py-2 font-mono text-xs text-fg-dim">
                  {displayName}
                </div>
              )}
              <form action={signOut}>
                <button
                  type="submit"
                  className="block w-full rounded-md px-3 py-2 text-left font-mono text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  Esci
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
