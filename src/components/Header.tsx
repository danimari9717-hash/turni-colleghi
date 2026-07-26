import { signOut } from "@/app/login/actions";
import type { Profile } from "@/types/database";

interface HeaderProps {
  profile: Pick<Profile, "nome" | "email" | "role"> | null;
}

export default function Header({ profile }: HeaderProps) {
  const displayName = profile?.nome || profile?.email || "Utente";
  const isAdmin = profile?.role === "admin";

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Turni
          </span>
          {profile && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isAdmin
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {isAdmin ? "admin" : "employee"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {profile && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400" title={profile.email}>
              {displayName}
            </span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Esci
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
