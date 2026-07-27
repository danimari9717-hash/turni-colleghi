"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");

  const [signInState, signInAction, signInPending] = useActionState<AuthState | null, FormData>(
    signIn,
    null,
  );
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthState | null, FormData>(
    signUp,
    null,
  );

  const isSignup = mode === "signup";
  const pending = isSignup ? signUpPending : signInPending;
  const state = isSignup ? signUpState : signInState;

  return (
    <div className="safe-top safe-bottom flex min-h-screen items-center justify-center px-4">
      <div className="panel-glow w-full max-w-sm p-9 animate-fade-in">
        {/* Logo + titolo */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/5">
            <span className="font-mono text-lg font-bold text-accent">T</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Turni</h1>
            <p className="font-mono text-xs text-fg-dim">command center</p>
          </div>
        </div>

        <p className="mt-7 text-sm text-fg-muted">
          {isSignup ? "Crea il tuo account" : "Accedi al tuo account"}
        </p>

        {/* Toggle signin / signup */}
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-border bg-base p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-wider transition ${
              !isSignup
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-fg-dim hover:text-fg-muted"
            }`}
          >
            Accedi
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-wider transition ${
              isSignup
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-fg-dim hover:text-fg-muted"
            }`}
          >
            Registrati
          </button>
        </div>

        {/* Form */}
        <form key={mode} action={isSignup ? signUpAction : signInAction} className="mt-7 space-y-5">
          {isSignup && (
            <div>
              <label htmlFor="nome" className="mb-2 block font-mono text-xs uppercase tracking-wider text-fg-dim">
                Nome
              </label>
              <input
                id="nome"
                name="nome"
                type="text"
                autoComplete="name"
                required
                className="input w-full px-4 py-2.5 text-sm"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-2 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input w-full px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              className="input w-full px-4 py-2.5 text-sm"
            />
          </div>

          {state?.error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 animate-fade-in">
              {state.error}
            </p>
          )}
          {state?.message && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 animate-fade-in">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="btn-accent w-full px-4 py-3 text-sm"
          >
            {pending ? "Attendi…" : isSignup ? "Crea account" : "Accedi"}
          </button>
        </form>
      </div>
    </div>
  );
}
