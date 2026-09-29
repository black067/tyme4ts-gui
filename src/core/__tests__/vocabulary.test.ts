import { describe, expect, it } from 'vitest'
import {
  ALL_TABOO_ITEMS,
  COMMON_AVOID_ITEMS,
  COMMON_TABOO_ITEMS,
  ENGINE_TERM_NAMES,
  SOLAR_TERM_NAMES
} from '../vocabulary'

describe('curated almanac vocabulary', () => {
  it('only lists 宜 items the engine actually knows', () => {
    const unknown = COMMON_TABOO_ITEMS.filter((item) => !ALL_TABOO_ITEMS.includes(item))
    expect(unknown).toEqual([])
    expect(ALL_TABOO_ITEMS.length).toBeGreaterThan(100)
  })

  it('only lists 忌 items the engine actually knows', () => {
    const unknown = COMMON_AVOID_ITEMS.filter((item) => !ALL_TABOO_ITEMS.includes(item))
    expect(unknown).toEqual([])
  })

  it('lists each picker item once', () => {
    expect(new Set(COMMON_TABOO_ITEMS).size).toBe(COMMON_TABOO_ITEMS.length)
    expect(new Set(COMMON_AVOID_ITEMS).size).toBe(COMMON_AVOID_ITEMS.length)
  })

  it('covers the 24 solar terms in calendar order', () => {
    expect(SOLAR_TERM_NAMES).toHaveLength(24)
    expect(SOLAR_TERM_NAMES[0]).toBe('小寒')
    expect(SOLAR_TERM_NAMES[23]).toBe('冬至')
    expect(new Set(SOLAR_TERM_NAMES).size).toBe(24)
  })

  it('agrees with the engine term table as a set', () => {
    expect([...SOLAR_TERM_NAMES].sort()).toEqual([...ENGINE_TERM_NAMES].sort())
  })
})
