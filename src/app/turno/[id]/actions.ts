"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ObiettivoFormState {
  error?: string;
  success?: boolean;
}

/**
 * Conferma un obiettivo per il turno corrente (self-report).
 * - Per obiettivi con soglia_gruppo (incasso_tab): se esiste già una conferma
 *   dello stesso gruppo per lo stesso turno+utente, la sostituisce.
 * - Per obiettivi senza soglia_gruppo (gratta_vinci, speciale): inserisce e basta
 *   (cumulabile più volte nello stesso turno).
 */
export async function completaObiettivo(
  prevState: ObiettivoFormState | null,
  formData: FormData,
): Promise<ObiettivoFormState> {
  const obiettivo_id = String(formData.get("obiettivo_id") ?? "").trim();
  const turno_id = String(formData.get("turno_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!obiettivo_id || !turno_id) {
    return { error: "Dati mancanti." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Non autenticato." };
  }

  // Recupera l'obiettivo per sapere se ha un soglia_gruppo
  const { data: obiettivo, error: objErr } = await supabase
    .from("obiettivi")
    .select("soglia_gruppo")
    .eq("id", obiettivo_id)
    .single();

  if (objErr || !obiettivo) {
    return { error: "Obiettivo non trovato." };
  }

  // Se ha soglia_gruppo, elimina eventuali conferme precedenti dello stesso gruppo
  // per lo stesso turno + stesso utente (selezione singola mutuamente esclusiva)
  if (obiettivo.soglia_gruppo) {
    // Trova gli obiettivi dello stesso gruppo
    const { data: sameGroup } = await supabase
      .from("obiettivi")
      .select("id")
      .eq("soglia_gruppo", obiettivo.soglia_gruppo);

    const sameGroupIds = (sameGroup ?? []).map((o) => o.id);

    if (sameGroupIds.length > 0) {
      await supabase
        .from("obiettivi_completati")
        .delete()
        .eq("turno_id", turno_id)
        .eq("user_id", user.id)
        .in("obiettivo_id", sameGroupIds);
    }
  }

  // Inserisce la nuova conferma
  const { error } = await supabase.from("obiettivi_completati").insert({
    obiettivo_id,
    user_id: user.id,
    turno_id,
    note,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/turno/${turno_id}`);
  revalidatePath("/classifica");
  return { success: true };
}

/**
 * Rimuove una conferma obiettivo (solo le proprie).
 */
export async function rimuoviCompletamento(
  prevState: ObiettivoFormState | null,
  formData: FormData,
): Promise<ObiettivoFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const turno_id = String(formData.get("turno_id") ?? "").trim();
  if (!id || !turno_id) {
    return { error: "Dati mancanti." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("obiettivi_completati")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/turno/${turno_id}`);
  revalidatePath("/classifica");
  return { success: true };
}
