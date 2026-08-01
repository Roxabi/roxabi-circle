/** Clamp to [0, 1]. */
export function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** log1p scale: log1p(x) / log1p(cap), clamped. */
export function logNorm(x: number, cap: number): number {
  if (x <= 0) return 0
  if (cap <= 0) return 0
  return clamp01(Math.log1p(x) / Math.log1p(cap))
}

/** Linear map with clamp. */
export function linearNorm(x: number, min: number, max: number): number {
  if (max <= min) return 0
  return clamp01((x - min) / (max - min))
}
