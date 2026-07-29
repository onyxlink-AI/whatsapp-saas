"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, LockKeyhole } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/features/auth/services/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="default"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Iniciando sesión...
        </>
      ) : (
        "Iniciar sesión"
      )}
    </Button>
  );
}

export function LoginForm({ message }: { message?: string }) {
  const [state, formAction] = useActionState(login, null);

  return (
    <div className="w-full max-w-md space-y-7">
      <div className="app-sidebar w-fit rounded-xl px-4 py-3 lg:hidden">
        <Image
          src="/brand/onyxlink-logo.png"
          alt="OnyxLink"
          width={140}
          height={28}
          className="h-auto w-36"
          priority
        />
      </div>

      <div className="auth-login-card surface-card p-6 sm:p-8">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Acceso seguro
          </div>
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Bienvenido de vuelta
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Ingresa a tu cuenta para continuar
          </p>
        </div>

        {message && (
          <p
            className="mt-5 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2.5 text-sm text-primary"
            role="status"
          >
            {message}
          </p>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="tu@email.com"
              autoComplete="email"
              aria-required="true"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Contraseña</Label>
              <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                ¿La has olvidado?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              aria-required="true"
              required
            />
          </div>

          {state?.error && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-border/70 pt-5 text-[11px] text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          Sesión cifrada y protegida
        </div>
      </div>

      <p className="text-center text-sm text-foreground/85">
        ¿No tienes cuenta?{" "}
        <Link
          href="/signup"
          className="text-primary underline-offset-4 hover:underline transition-colors duration-150"
        >
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
