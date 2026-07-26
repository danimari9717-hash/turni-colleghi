import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Matcha tutte le route eccetto quelle che iniziano con:
     * - _next/static (file statici)
     * - _next/image (ottimizzazione immagini)
     * - favicon.ico, svg, png, jpg, jpeg, gif, webp (favicon e asset)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
