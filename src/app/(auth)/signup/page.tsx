import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/features/auth/components/signup-form";
import { isSignupOpen } from "@/features/auth/services/signup-gate";

export const metadata: Metadata = {
  title: "Crear cuenta — Agente Onyxlink",
};

// isSignupOpen() reads live DB state (does any user exist yet?) that must
// flip to closed the instant the bootstrap admin signs up — it can never be
// correct as static content. Without this, `next build` tries to prerender
// the page at build time and crashes if Supabase env vars aren't loaded
// then (e.g. a CI build without secrets configured), even though the page
// works fine at real request time once the server actually has them.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // Invite-only after bootstrap: once the admin account exists, no public signup.
  if (!(await isSignupOpen())) {
    redirect(
      "/login?message=El%20registro%20es%20solo%20por%20invitaci%C3%B3n",
    );
  }

  return <SignupForm />;
}
