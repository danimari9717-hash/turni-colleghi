"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface RuoloFormState {
  error?: string;
  success?: boolean;
}

/**
 * Verifica che l'utente corrente sia admin.
 * Ritorna { id, isAdmin }. Safety net oltre alla RLS: anche se un client
 * malintenzionato riuscisse a chiamare questa server action, l'update
 * verrebbe comunque bloccato dal trigger trg_profiles_prevent_role_change
 * (che usa public.is_admin() basata su auth.uid()).
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, id: null as string | null, isAdmin: false };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";
  return { supabase, id: user.id, isAdmin };
}

/**
 * Cambia il ruolo di un utente (solo admin).
 * - Non permette a un admin di modificare il proprio ruolo (evita lockout).
 * - L'update passa attraverso il trigger trg_profiles_prevent_role_change
 *   che verifica public.is_admin() sul JWT dell'utente corrente.
 *   Se l'utente corrente non è admin, il trigger solleva un'eccezione.
 * - RLS profiles_update_admin permette l'update solo ad admin.
 */
export async function cambiaRuoloUtente(
  prevState: RuoloFormState | null,
  formData: FormData,
): Promise<RuoloFormState> {
  const target_id = String(formData.get("user_id") ?? "").trim();
  const nuovo_ruolo = String(formData.get("ruolo") ?? "").trim();

  if (!target_id) {
    return { error: "Utente mancante." };
  }
  if (nuovo_ruolo !== "admin" && nuovo_ruolo !== "employee") {
    return { error: "Ruolo non valido." };
  }

  const { supabase, id: currentUserId, isAdmin } = await requireAdmin();
  if (!currentUserId) {
    return { error: "Non autenticato." };
  }
  if (!isAdmin) {
    return { error: "Solo gli admin possono modificare i ruoli." };
  }
  // Impedisce auto-modifica del proprio ruolo (evita lockout).
  if (target_id === currentUserId) {
    return { error: "Non puoi modificare il tuo stesso ruolo." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: nuovo_ruolo })
    .eq("id", target_id);

  if (error) {
    // Il trigger solleva: 'Solo gli admin possono modificare il ruolo di un utente.'
    return { error: error.message };
  }

  revalidatePath("/utenti");
  revalidatePath("/classifica");
  return { success: true };
}
