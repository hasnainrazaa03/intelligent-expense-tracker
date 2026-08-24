/**
 * Read one series' value out of a recharts tooltip payload BY dataKey.
 *
 * recharts orders `payload` by the order the <Line>/<Area>/<Bar> children are
 * declared, not by the order a tooltip happens to list them. Indexing the
 * payload positionally therefore silently mislabels the series whenever the two
 * orders disagree — which is exactly how the budget chart came to report spend
 * as budget and budget as spend.
 */
export const seriesValue = (payload: unknown, dataKey: string): number => {
  if (!Array.isArray(payload)) return 0;
  const entry = payload.find((p) => p && typeof p === 'object' && (p as any).dataKey === dataKey);
  const value = entry ? Number((entry as any).value) : NaN;
  return Number.isFinite(value) ? value : 0;
};
