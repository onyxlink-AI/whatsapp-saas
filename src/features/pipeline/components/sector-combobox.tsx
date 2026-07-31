"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { listSectors } from "@/features/pipeline/services/deal-actions";

interface SectorComboboxProps {
  workspaceId: string;
  /** The sector's name (raw text) — the server finds-or-creates the matching row, so this component never needs a sector id. */
  value: string;
  onChange: (name: string) => void;
}

/**
 * Notion-style "Select" property: pick an existing sector or type a new one
 * — typing a value that doesn't match anything existing shows a "Crear ‹X›"
 * option, so it becomes a real, reusable option for every future deal in
 * this workspace (see findOrCreateSectorId in deal-actions.ts). Mirrors the
 * Command+Popover shape already used by contact-picker.tsx, but as a
 * single-value combobox rather than a search-and-fetch list.
 */
export function SectorCombobox({ workspaceId, value, onChange }: SectorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    listSectors(workspaceId).then(setSectors);
  }, [workspaceId, open]);

  const trimmedQuery = query.trim();
  const exactMatch = sectors.some(
    (s) => s.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );

  function select(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between text-sm font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value || "Elige o escribe un sector..."}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar o crear un sector..."
          />
          <CommandList>
            <CommandEmpty>Sin sectores todavía</CommandEmpty>
            <CommandGroup>
              {sectors
                .filter((s) => s.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
                .map((sector) => (
                  <CommandItem
                    key={sector.id}
                    value={sector.name}
                    onSelect={() => select(sector.name)}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5",
                        value === sector.name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {sector.name}
                  </CommandItem>
                ))}
              {trimmedQuery && !exactMatch && (
                <CommandItem value={`__create__${trimmedQuery}`} onSelect={() => select(trimmedQuery)}>
                  <Plus className="h-3.5 w-3.5" />
                  Crear «{trimmedQuery}»
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
