import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import type { Profile } from "@/types/database";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protezione route: se non autenticato, vai al login.
  if (!user) {
    redirect("/login");
  }

  // Legge il proprio profilo (policy profiles_select_self).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nome, email, role")
    .eq("id", user.id)
    .single<Pick<Profile, "id" | "nome" | "email" | "role">>();

  const isAdmin = profile?.role === "admin";

  return (
    <>
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Calendario turni
          </h1>
          {isAdmin && (
            <button
              type="button"
              disabled
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
              title="Disponibile dalla Fase 3"
            >
              + Nuovo turno
            </button>
          )}
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nessun turno da mostrare. La vista calendario sarà disponibile nella Fase 3.
          </p>
        </div>
      </main>
    </>
  );
}
