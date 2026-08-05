"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Pause,
  Play,
  RotateCcw,
  Maximize,
  Minimize,
} from "lucide-react";
import { buildContentScriptText, type ContentItemRow } from "@/features/content/types";

const SPEEDS = [
  { value: "20", label: "Lenta" },
  { value: "40", label: "Normal" },
  { value: "70", label: "Rápida" },
  { value: "100", label: "Muy rápida" },
];

const FONT_SIZES = [
  { value: "28", label: "Pequeño" },
  { value: "40", label: "Mediano" },
  { value: "56", label: "Grande" },
  { value: "72", label: "Muy grande" },
];

const THEMES = [
  { id: "dark", label: "Oscuro", bg: "#0b0b0f", fg: "#f5f5f5" },
  { id: "light", label: "Claro", bg: "#ffffff", fg: "#111111" },
  { id: "warm", label: "Cálido", bg: "#1a1207", fg: "#f6e7c8" },
];

interface Props {
  item: ContentItemRow;
}

export function Teleprompter({ item }: Props) {
  const text = buildContentScriptText(item);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("40");
  const [fontSize, setFontSize] = useState("40");
  const [themeId, setThemeId] = useState("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  useEffect(() => {
    function step(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const el = containerRef.current;
      if (el) {
        el.scrollTop += Number(speed) * dt;
      }
      rafRef.current = requestAnimationFrame(step);
    }

    if (playing) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(step);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed]);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      rootRef.current?.requestFullscreen?.();
    }
  }

  function handleReset() {
    setPlaying(false);
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex h-dvh flex-col"
      style={{ backgroundColor: theme.bg }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white" asChild>
          <Link href={`/contenido/${item.id}`} aria-label="Volver al guion">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white/90 hover:text-white"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? "Pausar" : "Reproducir"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white/70 hover:text-white"
          onClick={handleReset}
          aria-label="Reiniciar"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        <Select value={speed} onValueChange={setSpeed}>
          <SelectTrigger className="h-8 w-28 border-white/20 bg-transparent text-xs text-white/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEEDS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={fontSize} onValueChange={setFontSize}>
          <SelectTrigger className="h-8 w-28 border-white/20 bg-transparent text-xs text-white/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setThemeId(t.id)}
              aria-label={`Tema ${t.label}`}
              aria-pressed={themeId === t.id}
              className={cn(
                "h-7 w-7 rounded-full border-2",
                themeId === t.id ? "border-white" : "border-white/20",
              )}
              style={{ backgroundColor: t.bg }}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 text-white/70 hover:text-white"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-[40vh] sm:px-16">
        {text ? (
          <p
            className="mx-auto max-w-3xl whitespace-pre-wrap text-center font-medium leading-relaxed"
            style={{ color: theme.fg, fontSize: `${fontSize}px` }}
          >
            {text}
          </p>
        ) : (
          <p className="text-center text-white/50">Este contenido todavía no tiene guion.</p>
        )}
      </div>
    </div>
  );
}
