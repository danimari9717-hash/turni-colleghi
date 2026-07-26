"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

/**
 * Login con email + password. Al successo redirect su "/".
 */
export async function signIn(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Inserisci email e password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Credenziali non valide." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Registrazione con email + password + nome.
 * Il nome viene salvato in raw_user_meta_data; il trigger handle_new_user
 * lo copia in profiles.nome alla creazione del profilo.
 *
 * Nota: se "Confirm email" è attivo in Supabase (default), l'utente non è
 * subito loggato e riceve un messaggio. Se è disattivato, redirect su "/".
 */
export async function signUp(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();

  if (!email || !password) {
    return { error: "Inserisci email e password." };
  }
  if (password.length < 6) {
    return { error: "La password deve avere almeno 6 caratteri." };
  }
  if (!nome) {
    return { error: "Inserisci il tuo nome." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome } },
  });
  if (error) {
    return { error: error.message };
  }

  // Se c'è già una sessione (Confirm email disattivato), vai al calendario.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  // Altrimenti l'utente deve confermare l'email prima di accedere.
  return { message: "Account creato. Controlla la tua email per confermarlo, poi accedi." };
}

/**
 * Logout. Redirect su "/login".
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
