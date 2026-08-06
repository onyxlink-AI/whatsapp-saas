/**
 * team-chat-broadcast.ts — envío server-side de eventos Realtime Broadcast
 * privados vía HTTP (sin mantener socket). Deliberadamente SIN "use server":
 * cualquier función exportada de un archivo "use server" se convierte en un
 * endpoint invocable directamente desde el cliente con cualquier argumento —
 * exponer estas dos funciones así permitiría a un cliente spoofear un
 * TeamMessageRow arbitrario y forzar un broadcast falso a cualquier canal.
 * Este módulo es código de servidor normal, importado únicamente desde
 * otros módulos de servidor (team-chat-actions.ts, team-chat-attachments.ts).
 *
 * El cliente nunca emite el broadcast: solo se suscribe a recibir (ver la
 * policy de realtime.messages en 20260808000001_team_chat_schema.sql). Un
 * fallo aquí nunca debe tumbar la mutación que ya quedó persistida —
 * best-effort.
 */

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { TeamMessageRow } from "@/features/team-chat/types";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// httpSend() explícito, no send(): sin él, realtime-js hace el fallback
// automático a REST igualmente (avisando por consola que lo hará), pero ese
// fallback implícito está marcado para dejar de existir — aquí no
// mantenemos socket a propósito, así que se pide la vía REST sin
// ambigüedad. httpSend() no lanza en caso de fallo (devuelve
// {success:false,...}), a diferencia de send(): hay que comprobar el
// resultado explícitamente. removeChannel() al terminar, tal como
// recomienda la documentación de @supabase/realtime-js para canales
// creados solo para un envío REST puntual.
export async function broadcastTeamMessage(message: TeamMessageRow): Promise<void> {
  const client = svc();
  const channel = client.channel(`team:${message.channel_id}`, { config: { private: true } });
  try {
    const result = await channel.httpSend("new_message", message);
    if (!result.success) console.error("[broadcastTeamMessage] failed:", result.error);
  } catch (err) {
    console.error("[broadcastTeamMessage] failed:", err);
  } finally {
    await client.removeChannel(channel);
  }
}

export async function broadcastTeamMessageUpdate(message: TeamMessageRow): Promise<void> {
  const client = svc();
  const channel = client.channel(`team:${message.channel_id}`, { config: { private: true } });
  try {
    const result = await channel.httpSend("message_updated", message);
    if (!result.success) console.error("[broadcastTeamMessageUpdate] failed:", result.error);
  } catch (err) {
    console.error("[broadcastTeamMessageUpdate] failed:", err);
  } finally {
    await client.removeChannel(channel);
  }
}
