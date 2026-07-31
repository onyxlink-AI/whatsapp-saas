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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDeal, getDeal } from "@/features/pipeline/services/deal-actions";
import { SectorCombobox } from "./sector-combobox";
import { DEAL_PRODUCTS, type ContactSummary, type DealWithContact } from "@/features/pipeline/types";

interface CreateDealDialogProps {
  open: boolean;
  workspaceId: string;
  /** Set via the "Crear negocio" shortcut on an existing contact's own page (?createFor=<id>) — pre-fills the lead fields and links the deal to this real contact directly, instead of the inline-lead/promotion path. */
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
  const [leadName, setLeadName] = useState(initialContact?.name ?? "");
  const [leadPhone, setLeadPhone] = useState(initialContact?.phone ?? "");
  const [leadEmail, setLeadEmail] = useState(initialContact?.email ?? "");
  const [sectorName, setSectorName] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setLeadName(initialContact?.name ?? "");
    setLeadPhone(initialContact?.phone ?? "");
    setLeadEmail(initialContact?.email ?? "");
    setSectorName("");
    setTitle("");
    setValue("");
    setExpectedCloseDate("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleCreate() {
    if (!initialContact && !leadName.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (!initialContact && !leadPhone.trim()) {
      toast.error("El teléfono es requerido");
      return;
    }
    if (!title) {
      toast.error("Selecciona un producto");
      return;
    }

    startTransition(async () => {
      const result = await createDeal(workspaceId, {
        contact_id: initialContact?.id,
        lead_name: leadName.trim(),
        lead_phone: leadPhone.trim(),
        lead_email: leadEmail.trim(),
        sector_name: sectorName.trim(),
        title: title.trim(),
        value: value ? Number(value) : undefined,
        expected_close_date: expectedCloseDate || undefined,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Error al crear el negocio");
        return;
      }

      const created = await getDeal(result.data.id);
      if (created) onCreated(created);

      toast.success("Negocio creado");
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo negocio</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="Ej. Antonio Fernández"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sector</Label>
              <SectorCombobox
                workspaceId={workspaceId}
                value={sectorName}
                onChange={setSectorName}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={leadPhone}
                onChange={(e) => setLeadPhone(e.target.value)}
                placeholder="+34..."
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Correo</Label>
              <Input
                type="email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Producto</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Elige un producto..." />
              </SelectTrigger>
              <SelectContent>
                {DEAL_PRODUCTS.map((product) => (
                  <SelectItem key={product} value={product}>
                    {product}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Label className="text-xs">Fecha de cierre</Label>
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
            {isPending ? "Creando..." : "Crear negocio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
