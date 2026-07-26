"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ObiettivoFormState {
  error?: string;
  success?: boolean;
}

/**
 * Conferma un obiettivo per il turno corrente (self-report).
 * SINGLE-SELECT: selezionandone uno, qualsiasi obiettivo precedente
 * per lo stesso turno+utente viene eliminato (comportamento radio).
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

  // Single-select: elimina TUTTI i completamenti precedenti per questo turno+utente
  await supabase
    .from("obiettivi_completati")
    .delete()
    .eq("turno_id", turno_id)
    .eq("user_id", user.id);

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
