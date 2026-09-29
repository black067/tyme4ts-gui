import { describe, it } from 'vitest'
import { buildDayInfo, buildDaySummary } from '../day'
import { addDays } from '../date-key'

/**
 * Throughput budget.
 *
 * The bounds are deliberately loose (roughly 10x the measured cost on a
 * developer machine) so they only fire on an order-of-magnitude regression —
 * for example if a grid cell started building a full almanac.
 */
describe('engine throughput budget', () => {
  it('builds summaries cheaply enough for a year view', () => {
    const start = { year: 2024, month: 1, day: 1 }
    const began = performance.now()
    for (let index = 0; index < 400; index += 1) buildDaySummary(addDays(start, index))
    const perDay = (performance.now() - began) / 400
    // A year view needs ~380 summaries; a full almanac is ~10x this cost.
    expect(perDay).toBeLessThan(2)
  })

  it('builds a full almanac cheaply enough for a virtualized row', () => {
    const start = { year: 2024, month: 1, day: 1 }
    const began = performance.now()
    for (let index = 0; index < 40; index += 1) buildDayInfo(addDays(start, index))
    const perDay = (performance.now() - began) / 40
    expect(perDay).toBeLessThan(15)
  })
})
