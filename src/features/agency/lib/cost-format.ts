/**
 * Rough blended estimate across the model catalog (mix of premium/balanced/
 * fast tiers) — NOT a per-model real-time OpenRouter price. Good enough for
 * "is this in the right ballpark" at a glance; never present it as an exact
 * invoice figure. Adjust here if the model mix or OpenRouter pricing shifts.
 */
export const ESTIMATED_USD_PER_MILLION_TOKENS = 2.5;

export function estimateCostUsd(tokens: number): number {
  return (tokens / 1_000_000) * ESTIMATED_USD_PER_MILLION_TOKENS;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

export function formatUsd(amount: number): string {
  if (amount < 0.01 && amount > 0) return "<$0.01";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
