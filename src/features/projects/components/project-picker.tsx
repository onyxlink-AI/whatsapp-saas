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
import { searchProjectsForTask } from "@/features/projects/services/project-lookup";
import type { ProjectOption } from "@/features/projects/types";

interface ProjectPickerProps {
  workspaceId: string;
  onSelect: (project: ProjectOption) => void;
}

export function ProjectPicker({ workspaceId, onSelect }: ProjectPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectOption[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchProjectsForTask(workspaceId, query).then(setResults);
    }, 250);
    return () => clearTimeout(timeout);
  }, [workspaceId, query]);

  return (
    <Command className="border border-border/50 rounded-md">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Buscar proyecto..."
      />
      <CommandList>
        <CommandEmpty>Sin proyectos</CommandEmpty>
        <CommandGroup>
          {results.map((project) => (
            <CommandItem
              key={project.id}
              value={project.id}
              onSelect={() => onSelect(project)}
            >
              <span className="text-sm">{project.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
