"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AdjustmentFormState {
  error?: string;
  success?: boolean;
}

/**
 * Crea un adjustment manuale di punti (solo admin).
 * delta_fuoco e delta_diamanti possono essere negativi (sottrazione).
 */
export async function createAdjustment(
  prevState: AdjustmentFormState | null,
  formData: FormData,
): Promise<AdjustmentFormState> {
  const user_id = String(formData.get("user_id") ?? "").trim();
  const delta_fuoco = parseInt(String(formData.get("delta_fuoco") ?? "0"), 10) || 0;
  const delta_diamanti = parseInt(String(formData.get("delta_diamanti") ?? "0"), 10) || 0;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!user_id) {
    return { error: "Utente mancante." };
  }
  if (delta_fuoco === 0 && delta_diamanti === 0) {
    return { error: "Inserisci almeno un valore non zero." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Non autenticato." };
  }

  // Verifica che l'utente corrente sia admin (safety net oltre alla RLS)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Solo gli admin possono modificare i punti." };
  }

  const { error } = await supabase.from("punti_adjustments").insert({
    user_id,
    delta_fuoco,
    delta_diamanti,
    note,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/classifica");
  return { success: true };
}

/**
 * Elimina un adjustment (solo admin).
 */
export async function deleteAdjustment(
  prevState: AdjustmentFormState | null,
  formData: FormData,
): Promise<AdjustmentFormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "ID adjustment mancante." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("punti_adjustments")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/classifica");
  return { success: true };
}
