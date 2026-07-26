import { signOut } from "@/app/login/actions";
import type { Profile } from "@/types/database";

interface HeaderProps {
  profile: Pick<Profile, "nome" | "email" | "role"> | null;
}

export default function Header({ profile }: HeaderProps) {
  const displayName = profile?.nome || profile?.email || "Utente";
  const isAdmin = profile?.role === "admin";

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Logo "command center" */}
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

        <div className="flex items-center gap-4">
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
      </div>
    </header>
  );
}
