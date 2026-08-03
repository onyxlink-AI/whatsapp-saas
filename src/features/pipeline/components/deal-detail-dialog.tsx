"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, UserPlus } from "lucide-react";
import {
  convertDealToContact,
  deleteDeal,
  getDeal,
  updateDeal,
  type WorkspaceMember,
} from "@/features/pipeline/services/deal-actions";
import { listTasks } from "@/features/pipeline/services/task-actions";
import {
  DEAL_PRODUCTS,
  DEAL_STAGES,
  DEAL_STAGE_LABELS,
  type DealStage,
  type DealWithContact,
  type TaskRow as TaskRowType,
} from "@/features/pipeline/types";
import { TaskRow } from "./task-row";
import { TaskFormDialog } from "./task-form-dialog";

interface DealDetailDialogProps {
  dealId: string;
  members: WorkspaceMember[];
  onClose: () => void;
  onSaved: (deal: DealWithContact) => void;
  onDeleted: (dealId: string) => void;
}

export function DealDetailDialog({
  dealId,
  members,
  onClose,
  onSaved,
  onDeleted,
}: DealDetailDialogProps) {
  const [deal, setDeal] = useState<DealWithContact | null>(null);
  const [tasks, setTasks] = useState<TaskRowType[]>([]);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<DealStage>("exploracion");
  const [value, setValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const [dealData, taskData] = await Promise.all([
      getDeal(dealId),
      listTasks(null, { dealId }),
    ]);

    if (dealData) {
      setDeal(dealData);
      setTitle(dealData.title);
      setStage(dealData.stage);
      setValue(String(dealData.value));
      setExpectedCloseDate(dealData.expected_close_date ?? "");
      setNotes(dealData.notes ?? "");
      setLostReason(dealData.lost_reason ?? "");
    }
    setTasks(taskData);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: refresh() loads the deal + its tasks on open
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  function handleSave() {
    startTransition(async () => {
      const result = await updateDeal(dealId, {
        title: title.trim(),
        stage,
        value: value ? Number(value) : undefined,
        expected_close_date: expectedCloseDate || undefined,
        notes: notes || undefined,
        lost_reason: stage === "lost" ? lostReason || undefined : undefined,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Error al guardar el negocio");
        return;
      }

      const updated = await getDeal(dealId);
      if (updated) onSaved(updated);
      toast.success("Negocio actualizado");
    });
  }

  function handleAddToCrm() {
    startTransition(async () => {
      const result = await convertDealToContact(dealId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al agregar el cliente al CRM");
        return;
      }
      const updated = await getDeal(dealId);
      if (updated) {
        setDeal(updated);
        onSaved(updated);
      }
      toast.success("Cliente agregado al CRM");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDeal(dealId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar el negocio");
        return;
      }
      onDeleted(dealId);
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {deal?.contact?.name ||
              deal?.lead_name ||
              deal?.contact?.phone ||
              deal?.lead_phone ||
              "Negocio"}
          </DialogTitle>
        </DialogHeader>

        {deal && (
          <div className="space-y-4">
            {(deal.contact?.phone || deal.lead_phone || deal.contact?.email || deal.lead_email || deal.sector) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground -mt-2">
                {(deal.contact?.phone || deal.lead_phone) && (
                  <span>{deal.contact?.phone || deal.lead_phone}</span>
                )}
                {(deal.contact?.email || deal.lead_email) && (
                  <span>{deal.contact?.email || deal.lead_email}</span>
                )}
                {deal.sector && (
                  <span className="rounded-full border border-border/50 px-2 py-0.5">
                    {deal.sector.name}
                  </span>
                )}
              </div>
            )}

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
                <Label className="text-xs">Etapa</Label>
                <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DEAL_STAGE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor</Label>
                <Input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
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

            {stage === "lost" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo de pérdida</Label>
                <Input
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm min-h-16"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tareas</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1"
                  onClick={() => setTaskDialogOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  Agregar
                </Button>
              </div>
              <div className="rounded-md border border-border/40">
                {tasks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Sin tareas
                  </p>
                )}
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    members={members}
                    onChanged={refresh}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive gap-1.5"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </Button>
            {deal && !deal.contact_id && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleAddToCrm}
                disabled={isPending}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Agregar a CRM
              </Button>
            )}
          </div>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {deal && (
        <TaskFormDialog
          open={taskDialogOpen}
          dealId={deal.id}
          onClose={() => setTaskDialogOpen(false)}
          onCreated={refresh}
        />
      )}
    </Dialog>
  );
}
