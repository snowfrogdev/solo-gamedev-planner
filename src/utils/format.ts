/** Format a number compactly (e.g. 1500 → "$1.5k", -300 → "-$300") with an optional prefix. */
export function fmtCompact(n: number, prefix = ''): string {
  if (n < 0) return `-${fmtCompact(-n, prefix)}`;
  return n >= 1000 ? `${prefix}${(n / 1000).toFixed(1)}k` : `${prefix}${Math.round(n)}`;
}
