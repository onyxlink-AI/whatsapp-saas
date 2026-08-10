"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Plus, Trash2, X, Presentation, Sparkles, Wand2 } from "lucide-react";
import {
  deleteContentItem,
  updateContentItem,
  type ContentInput,
} from "@/features/content/services/content-actions";
import { generateContentScript } from "@/features/content/services/content-script-ai";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  CONTENT_ORIENTATION_LABELS,
  SCRIPT_STRUCTURES,
  type ContentItemRow,
  type ContentOrientation,
  type ContentStatus,
  type ReferenceLink,
} from "@/features/content/types";
import type { ProjectOption } from "@/features/projects/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";
import { ProjectPicker } from "@/features/projects/components/project-picker";

interface Props {
  workspaceId: string;
  item: ContentItemRow;
  members: WorkspaceMember[];
  initialProject: ProjectOption | null;
  /** Adónde vuelve la flecha — calculado y validado en contenido/[id]/page.tsx a partir de ?from=. */
  backHref: string;
}

export function ContentEditor({ workspaceId, item, members, initialProject, backHref }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(item.title);
  const [mainIdea, setMainIdea] = useState(item.main_idea ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [contentType, setContentType] = useState(item.content_type ?? "");
  const [platform, setPlatform] = useState(item.platform ?? "");
  const [orientation, setOrientation] = useState<ContentOrientation | "none">(item.orientation ?? "none");
  const [status, setStatus] = useState<ContentStatus>(item.status);
  const [responsibleId, setResponsibleId] = useState(item.responsible_id ?? "none");
  const [project, setProject] = useState<ProjectOption | null>(initialProject);
  const [scheduledDate, setScheduledDate] = useState(item.scheduled_date ?? "");
  const [durationEstimate, setDurationEstimate] = useState(item.duration_estimate ?? "");

  const [hook, setHook] = useState(item.script_hook ?? "");
  const [body, setBody] = useState(item.script_body ?? "");
  const [closing, setClosing] = useState(item.script_closing ?? "");
  const [cta, setCta] = useState(item.script_cta ?? "");
  const [bullets, setBullets] = useState<string[]>(item.bullet_points ?? []);
  const [newBullet, setNewBullet] = useState("");
  const [links, setLinks] = useState<ReferenceLink[]>(item.reference_links ?? []);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [lighting, setLighting] = useState(item.lighting_notes ?? "");
  const [music, setMusic] = useState(item.music_notes ?? "");

  const [metricViews, setMetricViews] = useState(item.metric_views?.toString() ?? "");
  const [metricReach, setMetricReach] = useState(item.metric_reach?.toString() ?? "");
  const [metricLikes, setMetricLikes] = useState(item.metric_likes?.toString() ?? "");
  const [metricComments, setMetricComments] = useState(item.metric_comments?.toString() ?? "");
  const [metricShares, setMetricShares] = useState(item.metric_shares?.toString() ?? "");
  const [metricSaves, setMetricSaves] = useState(item.metric_saves?.toString() ?? "");
  const [metricClicks, setMetricClicks] = useState(item.metric_clicks?.toString() ?? "");
  const [metricLeads, setMetricLeads] = useState(item.metric_leads?.toString() ?? "");
  const [metricNotes, setMetricNotes] = useState(item.metric_notes ?? "");

  const [structuresOpen, setStructuresOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiReplaceConfirmOpen, setAiReplaceConfirmOpen] = useState(false);
  const hookFieldRef = useRef<HTMLTextAreaElement>(null);

  // Campos destino que la IA rellenaría — usados tanto para detectar
  // sustitución (§5.2) como para saber a cuáles se les debe enfocar tras
  // generar.
  function scriptFieldsWithContent(): string[] {
    const labeled: [string, string][] = [
      ["Hook", hook],
      ["Desarrollo", body],
      ["Cierre", closing],
      ["CTA", cta],
      ["Bullet points", bullets.join("")],
      ["Referencias y enlaces", links.map((l) => l.url).join("")],
      ["Luces", lighting],
      ["Música", music],
      ["Notas", notes],
    ];
    return labeled.filter(([, value]) => value.trim().length > 0).map(([label]) => label);
  }

  function applyGeneratedScript(result: Awaited<ReturnType<typeof generateContentScript>>) {
    if (!result.ok) {
      if (result.code === "openrouter_not_configured" || result.code === "openrouter_disabled") {
        // El botón sigue disponible, pero el mensaje conduce claramente a
        // revisar la integración en vez de un error genérico.
        toast.error(result.error, {
          action: { label: "Ir a Ajustes", onClick: () => router.push("/settings?tab=integraciones") },
        });
      } else {
        toast.error(result.error ?? "No se pudo generar el guion");
      }
      return;
    }
    const g = result.data;
    setHook(g.hook);
    setBody(g.body);
    setClosing(g.closing);
    setCta(g.cta);
    setBullets(g.bulletPoints);
    setLinks(g.links);
    setLighting(g.lighting);
    setMusic(g.music);
    setNotes(g.notes);
    toast.success("Guion generado — revisa y edita todo antes de guardar");
    // No autoguarda (§5.1) — solo llena el estado local; el usuario decide
    // cuándo pulsar Guardar.
    requestAnimationFrame(() => hookFieldRef.current?.focus());
  }

  function runGeneration() {
    setAiGenerating(true);
    startTransition(async () => {
      try {
        const result = await generateContentScript(workspaceId, {
          mainIdea,
          description,
          contentType,
          platform,
          orientation: orientation === "none" ? null : orientation,
          durationEstimate,
          responsibleId: responsibleId === "none" ? null : responsibleId,
          scheduledDate: scheduledDate || null,
        });
        applyGeneratedScript(result);
      } catch (err) {
        // Fallo inesperado (red, servidor) — nunca deja de estar controlado:
        // el borrador previo no se toca, igual que un error normal de la
        // acción de servidor.
        console.error("[ContentEditor] Error al generar guion:", err);
        toast.error("No se pudo generar el guion. Intenta de nuevo.");
      } finally {
        setAiGenerating(false);
      }
    });
  }

  function handleGenerateClick() {
    if (scriptFieldsWithContent().length > 0) {
      setAiReplaceConfirmOpen(true);
      return;
    }
    runGeneration();
  }

  function handleConfirmReplace() {
    setAiReplaceConfirmOpen(false);
    runGeneration();
  }

  function toInt(v: string): number | null {
    if (!v.trim()) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  function handleSave() {
    startTransition(async () => {
      const input: ContentInput = {
        title: title.trim() || "Sin título",
        main_idea: mainIdea,
        description,
        content_type: contentType,
        platform,
        orientation: orientation === "none" ? null : orientation,
        project_id: project?.id ?? null,
        responsible_id: responsibleId === "none" ? null : responsibleId,
        scheduled_date: scheduledDate || null,
        duration_estimate: durationEstimate,
        script_hook: hook,
        script_body: body,
        script_closing: closing,
        script_cta: cta,
        bullet_points: bullets,
        reference_links: links,
        notes,
        lighting_notes: lighting,
        music_notes: music,
        metric_views: toInt(metricViews),
        metric_reach: toInt(metricReach),
        metric_likes: toInt(metricLikes),
        metric_comments: toInt(metricComments),
        metric_shares: toInt(metricShares),
        metric_saves: toInt(metricSaves),
        metric_clicks: toInt(metricClicks),
        metric_leads: toInt(metricLeads),
        metric_notes: metricNotes,
      };
      const result = await updateContentItem(workspaceId, item.id, input);
      if (!result.ok) {
        toast.error(result.error ?? "Error al guardar");
        return;
      }
      toast.success("Contenido guardado");
    });
  }

  function handleStatusChange(next: ContentStatus) {
    setStatus(next);
    startTransition(async () => {
      const result = await updateContentItem(workspaceId, item.id, { status: next });
      if (!result.ok) {
        toast.error(result.error ?? "Error al cambiar el estado");
        setStatus(item.status);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteContentItem(workspaceId, item.id);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar");
        return;
      }
      setDeleteConfirmOpen(false);
      router.push("/contenido");
    });
  }

  const hasScript = Boolean(hook.trim() || body.trim() || closing.trim() || cta.trim());

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={backHref} aria-label="Volver a Contenido">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 min-w-0 flex-1 font-display text-base font-semibold sm:max-w-sm"
        />
        <Select value={status} onValueChange={(v) => handleStatusChange(v as ContentStatus)}>
          <SelectTrigger className="h-9 w-full text-xs sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CONTENT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          {hasScript && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
              <Link href={`/contenido/${item.id}/teleprompter`}>
                <Presentation className="h-3.5 w-3.5" />
                Teleprompter
              </Link>
            </Button>
          )}
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={handleSave} disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>

      <section className="surface-card space-y-4 p-5">
        <h2 className="font-display text-sm font-semibold">General</h2>
        <div className="space-y-1.5">
          <Label className="text-xs">Idea principal</Label>
          <Textarea value={mainIdea} onChange={(e) => setMainIdea(e.target.value)} className="min-h-16 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Descripción</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16 text-sm" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de contenido</Label>
            <Input value={contentType} onChange={(e) => setContentType(e.target.value)} placeholder="Reel, post, video largo..." className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Red social</Label>
            <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Instagram, TikTok..." className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Formato</Label>
            <Select value={orientation} onValueChange={(v) => setOrientation(v as ContentOrientation | "none")}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin definir</SelectItem>
                <SelectItem value="vertical">{CONTENT_ORIENTATION_LABELS.vertical}</SelectItem>
                <SelectItem value="horizontal">{CONTENT_ORIENTATION_LABELS.horizontal}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Duración estimada</Label>
            <Input value={durationEstimate} onChange={(e) => setDurationEstimate(e.target.value)} placeholder="30s, 2 min..." className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Responsable</Label>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha prevista</Label>
            <Input type="date" value={scheduledDate ?? ""} onChange={(e) => setScheduledDate(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Proyecto (opcional)</Label>
          {project ? (
            <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
              <span className="text-sm">{project.name || "Proyecto asociado"}</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setProject(null)}>
                Quitar
              </Button>
            </div>
          ) : (
            <ProjectPicker workspaceId={workspaceId} onSelect={setProject} />
          )}
        </div>
      </section>

      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">Guion</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleGenerateClick}
              disabled={aiGenerating}
              aria-busy={aiGenerating}
            >
              {aiGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Generar guion con IA
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setStructuresOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              Estructuras de guion
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Hook</Label>
          <Textarea ref={hookFieldRef} value={hook} onChange={(e) => setHook(e.target.value)} className="min-h-12 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Desarrollo</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-24 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cierre</Label>
          <Textarea value={closing} onChange={(e) => setClosing(e.target.value)} className="min-h-12 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">CTA</Label>
          <Input value={cta} onChange={(e) => setCta(e.target.value)} className="h-8 text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Bullet points</Label>
          <ul className="space-y-1">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">• {b}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setBullets(bullets.filter((_, idx) => idx !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Input
              value={newBullet}
              onChange={(e) => setNewBullet(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newBullet.trim()) {
                  e.preventDefault();
                  setBullets([...bullets, newBullet.trim()]);
                  setNewBullet("");
                }
              }}
              placeholder="Nuevo punto..."
              className="h-8 text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={!newBullet.trim()}
              onClick={() => { setBullets([...bullets, newBullet.trim()]); setNewBullet(""); }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Referencias y enlaces</Label>
          <ul className="space-y-1">
            {links.map((l, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">
                  {l.label || l.url} {l.label && <span className="text-muted-foreground">— {l.url}</span>}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setLinks(links.filter((_, idx) => idx !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Etiqueta" className="h-8 w-32 text-sm" />
            <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://..." className="h-8 flex-1 text-sm" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={!newLinkUrl.trim()}
              onClick={() => {
                setLinks([...links, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }]);
                setNewLinkLabel("");
                setNewLinkUrl("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Luces</Label>
            <Input value={lighting} onChange={(e) => setLighting(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Música</Label>
            <Input value={music} onChange={(e) => setMusic(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16 text-sm" />
        </div>
      </section>

      <section className="surface-card space-y-4 p-5">
        <h2 className="font-display text-sm font-semibold">Métricas manuales</h2>
        <p className="text-xs text-muted-foreground">
          Se registran a mano — OnyxLink no se conecta a APIs de redes sociales.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricField label="Vistas" value={metricViews} onChange={setMetricViews} />
          <MetricField label="Alcance" value={metricReach} onChange={setMetricReach} />
          <MetricField label="Me gusta" value={metricLikes} onChange={setMetricLikes} />
          <MetricField label="Comentarios" value={metricComments} onChange={setMetricComments} />
          <MetricField label="Compartidos" value={metricShares} onChange={setMetricShares} />
          <MetricField label="Guardados" value={metricSaves} onChange={setMetricSaves} />
          <MetricField label="Clics" value={metricClicks} onChange={setMetricClicks} />
          <MetricField label="Leads" value={metricLeads} onChange={setMetricLeads} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Observaciones sobre repercusión</Label>
          <Textarea value={metricNotes} onChange={(e) => setMetricNotes(e.target.value)} className="min-h-16 text-sm" />
        </div>
      </section>

      <Button variant="ghost" size="sm" className="w-fit gap-1.5 text-destructive" onClick={() => setDeleteConfirmOpen(true)} disabled={isPending}>
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar contenido
      </Button>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar contenido</DialogTitle>
            <DialogDescription>
              “{item.title}” se eliminará definitivamente. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiReplaceConfirmOpen} onOpenChange={setAiReplaceConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ya hay contenido en el guion</DialogTitle>
            <DialogDescription>
              Generar con IA sustituirá lo que ya está escrito en:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm text-foreground">
            {scriptFieldsWithContent().map((field) => (
              <li key={field}>• {field}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiReplaceConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmReplace}>
              Sustituir contenido existente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={structuresOpen} onOpenChange={setStructuresOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Estructuras de guion</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Solo inspiran — no modifican tu guion automáticamente.
          </p>
          <ul className="space-y-3">
            {SCRIPT_STRUCTURES.map((s) => (
              <li key={s.title} className="rounded-md border border-border/50 p-3">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.steps.join(" → ")}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}
