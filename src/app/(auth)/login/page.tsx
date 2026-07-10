import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión — Agente Onyxlink",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  return <LoginForm message={message} />;
}
