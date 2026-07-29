import { useEffect, useState } from 'react';
import type { OfficeAgentSeatProjection } from '../central-integrations/office-agent-projection';
import { fetchOfficeAgentsRoster } from '../lib/saasOfficeAgentsAdapter';

export type OfficeAgentsRoster = {
  seats: OfficeAgentSeatProjection[];
  loading: boolean;
  error: string | null;
};

/** Real, sanitized, published-only specialist roster for the 3D scene — never fixtures, never draft content. */
export function useOfficeAgentsRoster(workspaceId: string): OfficeAgentsRoster {
  const [seats, setSeats] = useState<OfficeAgentSeatProjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOfficeAgentsRoster(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        setSeats(result.seats);
        setError(null);
      } else {
        setError(result.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return { seats, loading, error };
}
