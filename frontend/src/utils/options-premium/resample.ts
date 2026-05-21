// ─── resample.ts ──────────────────────────────────────────────────────────
// Resamples 1-minute OHLCV data to a larger interval (e.g. 5m, 15m, 30m).
// Ported from thirdPrj/src/utils/resample.js

import type { OHLCVPoint } from '@/api/options-premium'

/**
 * Resample OHLCV data from 1-minute candles to N-minute candles.
 *
 * @param data   - Array of 1-min OHLCV points (date in ms)
 * @param mins   - Target interval in minutes (1 = no resampling)
 * @returns Resampled OHLCV array
 */
export function resample(data: OHLCVPoint[], mins: number): OHLCVPoint[] {
  if (!data || data.length === 0) return []
  if (mins <= 1) return [...data]

  const periodMs = mins * 60 * 1000
  const buckets = new Map<number, OHLCVPoint>()

  for (const bar of data) {
    const bucketStart = Math.floor(bar.date / periodMs) * periodMs
    const existing = buckets.get(bucketStart)
    if (existing) {
      existing.high = Math.max(existing.high, bar.high)
      existing.low = Math.min(existing.low, bar.low)
      existing.close = bar.close
      existing.volume += bar.volume
    } else {
      buckets.set(bucketStart, { ...bar, date: bucketStart })
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.date - b.date)
}
