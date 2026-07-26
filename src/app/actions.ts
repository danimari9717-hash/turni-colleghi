"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SHIFTS, type ShiftSlot } from "@/lib/shifts";
import type { TurnoUpdate } from "@/types/database";

export interface TurnoFormState {
  error?: string;
  success?: boolean;
}

/**
 * Crea un nuovo turno. Solo admin. La fascia (slot) determina ora_inizio/ora_fine.
 * created_by viene impostato all'id dell'admin corrente (richiesto dalla RLS).
 */
export async function createTurno(
  prevState: TurnoFormState | null,
  formData: FormData,
): Promise<TurnoFormState> {
  const user_id = String(formData.get("user_id") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const slot = String(formData.get("slot") ?? "") as ShiftSlot;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!user_id || !data || !slot) {
    return { error: "Seleziona collega, data e fascia." };
  }
  if (!SHIFTS[slot]) {
    return { error: "Fascia non valida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Non autenticato." };
  }

  // Controllo app-level: max 2 turni per (data, ora_inizio).
  // Il trigger DB fa da safety net, ma questo dà un messaggio più chiaro.
  const { count: existing } = await supabase
    .from("turni")
    .select("id", { count: "exact", head: true })
    .eq("data", data)
    .eq("ora_inizio", SHIFTS[slot].start);

  if ((existing ?? 0) >= 2) {
    return { error: "Slot pieno: massimo 2 persone per fascia." };
  }

  const { error } = await supabase.from("turni").insert({
    user_id,
    data,
    ora_inizio: SHIFTS[slot].start,
    ora_fine: SHIFTS[slot].end,
    note,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/**
 * Aggiorna un turno esistente. Solo admin.
 */
export async function updateTurno(
  prevState: TurnoFormState | null,
  formData: FormData,
): Promise<TurnoFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const user_id = String(formData.get("user_id") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const slot = String(formData.get("slot") ?? "") as ShiftSlot;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!id || !user_id || !data || !slot) {
    return { error: "Seleziona collega, data e fascia." };
  }
  if (!SHIFTS[slot]) {
    return { error: "Fascia non valida." };
  }

  const supabase = await createClient();
  const payload: TurnoUpdate = {
    user_id,
    data,
    ora_inizio: SHIFTS[slot].start,
    ora_fine: SHIFTS[slot].end,
    note,
  };

  const { error } = await supabase.from("turni").update(payload).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/**
 * Elimina un turno. Solo admin.
 */
export async function deleteTurno(
  prevState: TurnoFormState | null,
  formData: FormData,
): Promise<TurnoFormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "ID turno mancante." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("turni").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}
