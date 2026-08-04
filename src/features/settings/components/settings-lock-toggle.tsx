"use client";

import * as React from "react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsLockStore } from "@/features/settings/store/settings-lock-store";

/**
 * Toggle del candado de Ajustes — vive junto al ThemeToggle en el header,
 * visible en todo el panel. Bloquea/desbloquea el acceso a Ajustes en este
 * navegador (misma jerarquía que el modo claro/oscuro: preferencia local,
 * sin contraseña, cualquiera con acceso al panel puede ponerlo y quitarlo).
 * Mismo manejo de mounted state que ThemeToggle para evitar hydration
 * mismatch con el valor persistido en localStorage.
 */
export function SettingsLockToggle() {
  const locked = useSettingsLockStore((s) => s.locked);
  const toggle = useSettingsLockStore((s) => s.toggle);
  const [mounted, setMounted] = React.useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only flag to defer the persisted lock state past hydration, mirroring ThemeToggle's pattern.
  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Candado de Ajustes"
        disabled
        className="text-muted-foreground"
      >
        <span className="h-4 w-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={locked ? "Desbloquear Ajustes" : "Bloquear Ajustes"}
      onClick={toggle}
      className={
        locked
          ? "text-destructive hover:text-destructive"
          : "text-muted-foreground hover:text-foreground"
      }
    >
      {locked ? (
        <Lock className="h-4 w-4" aria-hidden="true" />
      ) : (
        <LockOpen className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
