"use server";

/**
 * google-calendar-view.ts — thin, read-only wrapper around the shared Google
 * Calendar client, feeding the Agenda module's bottom panel. Deliberately the
 * one cross-feature import in this module (into `inbox`'s calendar client) —
 * documented exception, since duplicating the service-account JWT auth here
 * would be pure risk for no benefit.
 */

import { createClient } from "@/lib/supabase/server";
import {
  getGoogleCalendarConfig,
  listGoogleCalendarEvents,
} from "@/features/inbox/services/google-calendar-client";
import type { GoogleCalendarEventView } from "@/features/projects/types";

export interface GoogleCalendarViewResult {
  connected: boolean;
  events: GoogleCalendarEventView[];
  error?: string;
}

export async function listGoogleEventsForRange(
  workspaceId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleCalendarViewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { connected: false, events: [] };

  const cfg = await getGoogleCalendarConfig(workspaceId);
  if (!cfg) return { connected: false, events: [] };

  try {
    const events = await listGoogleCalendarEvents(
      cfg.calendarId,
      timeMinIso,
      timeMaxIso,
    );
    return { connected: true, events };
  } catch (err) {
    console.error("[listGoogleEventsForRange] error:", err);
    return {
      connected: true,
      events: [],
      error:
        err instanceof Error
          ? err.message
          : "Error al sincronizar con Google Calendar",
    };
  }
}
