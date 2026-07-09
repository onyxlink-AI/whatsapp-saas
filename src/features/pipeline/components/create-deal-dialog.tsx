"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDeal, getDeal } from "@/features/pipeline/services/deal-actions";
import { ContactPicker } from "./contact-picker";
import type { ContactSummary, DealWithContact } from "@/features/pipeline/types";

interface CreateDealDialogProps {
  open: boolean;
  workspaceId: string;
  initialContact: ContactSummary | null;
  onClose: () => void;
  onCreated: (deal: DealWithContact) => void;
}

export function CreateDealDialog({
  open,
  workspaceId,
  initialContact,
  onClose,
  onCreated,
}: CreateDealDialogProps) {
  const [contact, setContact] = useState<ContactSummary | null>(initialContact);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setContact(initialContact);
    setTitle("");
    setValue("");
    setExpectedCloseDate("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleCreate() {
    if (!contact) {
      toast.error("Selecciona un contacto");
      return;
    }
    if (!title.trim()) {
      toast.error("El título es requerido");
      return;
    }

    startTransition(async () => {
      const result = await createDeal({
        contact_id: contact.id,
        title: title.trim(),
        value: value ? Number(value) : undefined,
        expected_close_date: expectedCloseDate || undefined,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Error al crear el deal");
        return;
      }

      const created = await getDeal(result.data.id);
      if (created) onCreated(created);

      toast.success("Deal creado");
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo deal</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Contacto</Label>
            {contact ? (
              <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-sm">{contact.name || "Sin nombre"}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {contact.phone}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setContact(null)}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <ContactPicker workspaceId={workspaceId} onSelect={setContact} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Plan Agent AI Max"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor</Label>
              <Input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cierre esperado</Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isPending}>
            {isPending ? "Creando..." : "Crear deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
