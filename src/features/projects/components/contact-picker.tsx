"use client";

import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchContactsForProject } from "@/features/projects/services/contact-lookup";
import type { ContactOption } from "@/features/projects/types";

interface ContactPickerProps {
  workspaceId: string;
  onSelect: (contact: ContactOption) => void;
}

export function ContactPicker({ workspaceId, onSelect }: ContactPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactOption[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchContactsForProject(workspaceId, query).then(setResults);
    }, 250);
    return () => clearTimeout(timeout);
  }, [workspaceId, query]);

  return (
    <Command className="border border-border/50 rounded-md">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Buscar por nombre o teléfono..."
      />
      <CommandList>
        <CommandEmpty>Sin clientes</CommandEmpty>
        <CommandGroup>
          {results.map((contact) => (
            <CommandItem
              key={contact.id}
              value={contact.id}
              onSelect={() => onSelect(contact)}
            >
              <div className="flex flex-col">
                <span className="text-sm">{contact.name || "Sin nombre"}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {contact.phone}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
