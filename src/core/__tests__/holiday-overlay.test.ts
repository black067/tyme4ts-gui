/**
 * Holiday overlay tests.
 *
 * The two fixtures are verbatim upstream snapshots (`holiday-cn`, see
 * `tests/fixtures/holiday-cn/README.md`), so nothing here touches the network.
 * Everything goes through the `@core` facade on purpose: these tests also prove
 * the overlay is exported and that `day.ts` / `year.ts` are genuinely wired to
 * it, not merely that the pure helpers agree with themselves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture2025 from '../../../tests/fixtures/holiday-cn/2025.json'
import fixture2026 from '../../../tests/fixtures/holiday-cn/2026.json'
import {
  buildDayInfo,
  buildDaySummary,
  buildHolidayOverlay,
  buildYearInfo,
  getHolidayOverlay,
  getHolidayOverlayVersion,
  installHolidayPayloads,
  normalizeHolidayPayload,
  onHolidayOverlayChange,
  resetHolidayOverlay,
  resolveHoliday,
  setHolidayOverlay,
  type DateKey,
  type HolidayPayloadOutcome,
  type HolidayRef
} from '..'

const key = (year: number, month: number, day: number): DateKey => ({ year, month, day })

/**
 * The committed snapshots, imported rather than read from disk: `tsconfig.web`
 * typechecks `src/core/**` without node types, and importing the JSON also means
 * the test cannot depend on the working directory.
 */
function readFixture(year: 2025 | 2026): unknown {
  return year === 2025 ? fixture2025 : fixture2026
}

/** Narrows the outcome and fails loudly with the validator's own message. */
function expectUsable(
  outcome: HolidayPayloadOutcome
): Extract<HolidayPayloadOutcome, { ok: true }> {
  if (!outcome.ok) throw new Error(`expected a usable payload, got: ${outcome.error}`)
  return outcome
}

/** The overlay the engine sees is module state, so every test starts cold. */
beforeEach(() => {
  resetHolidayOverlay()
})

afterEach(() => {
  resetHolidayOverlay()
})

describe('normalizeHolidayPayload', () => {
  it('accepts the committed snapshots and keeps only the three known fields', () => {
    const outcome2026 = expectUsable(normalizeHolidayPayload(readFixture(2026)))
    expect(outcome2026.year).toBe(2026)
    expect(outcome2026.entries).toHaveLength(39)
    expect(outcome2026.dropped).toBe(0)
    expect(outcome2026.spill).toBe(0)
    // `$schema` / `$id` / `papers` are dropped by construction, not carried along.
    expect(outcome2026.entries.find((entry) => entry.iso === '2026-02-15')).toEqual({
      iso: '2026-02-15',
      name: '春节',
      isOffDay: true
    })
    expect(outcome2026.entries[0]).toEqual({ iso: '2026-01-01', name: '元旦', isOffDay: true })
    expect(outcome2026.entries.at(-1)).toEqual({
      iso: '2026-10-10',
      name: '国庆节',
      isOffDay: false
    })

    const outcome2025 = expectUsable(normalizeHolidayPayload(readFixture(2025)))
    expect(outcome2025.entries).toHaveLength(33)
    expect(outcome2025.dropped).toBe(0)
    expect(outcome2025.entries.at(-1)).toEqual({
      iso: '2025-10-11',
      name: '国庆节、中秋节',
      isOffDay: false
    })
  })

  it('rejects a wholly unusable payload as a value instead of throwing', () => {
    const unusable: unknown[] = [
      null,
      undefined,
      42,
      [],
      '2026-01-01',
      { days: [] }, // no year
      { year: 2026 }, // truncated download: no days array
      { year: 2026, days: {} },
      { year: 2026, days: null },
      { year: '2026', days: [] },
      { year: 2026.5, days: [] },
      { year: Number.NaN, days: [] },
      { year: 0, days: [] },
      { year: 10000, days: [] }
    ]

    for (const payload of unusable) {
      const outcome = normalizeHolidayPayload(payload)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.error).toMatch(/节假日数据/)
    }
  })

  it('treats truncated JSON as a parse error for the caller, and raw text as unusable', () => {
    // The exact form a response body arrives in, cut off mid-download.
    const body = JSON.stringify(fixture2026)
    expect(() => JSON.parse(body.slice(0, 120))).toThrow(SyntaxError)
    // Handed to the validator anyway, it is still refused rather than thrown on.
    expect(normalizeHolidayPayload(body.slice(0, 120))).toMatchObject({ ok: false })
    // Even the complete document is just a string, not a payload.
    expect(normalizeHolidayPayload(body)).toMatchObject({ ok: false })
  })

  it('drops every malformed days entry and counts them', () => {
    const outcome = expectUsable(
      normalizeHolidayPayload({
        year: 2026,
        days: [
          null,
          42,
          '2026-01-01',
          [],
          { name: '春节', date: '2026-02-15' }, // isOffDay missing
          { name: '春节', date: '2026-02-15', isOffDay: 'true' }, // stringly-typed
          { name: '', date: '2026-02-15', isOffDay: true },
          { name: '   ', date: '2026-02-15', isOffDay: true },
          { name: 1, date: '2026-02-15', isOffDay: true },
          { name: '春节', date: '2026-2-15', isOffDay: true }, // not zero-padded
          { name: '春节', date: '2026-02-30', isOffDay: true }, // no such day
          { name: '春节', date: '2026-13-01', isOffDay: true }, // no such month
          { name: '春节', date: '1582-10-06', isOffDay: true }, // Gregorian reform gap
          { name: '春节', date: 20260215, isOffDay: true },
          { name: '春节', date: '2026-02-15', isOffDay: true, extra: 'ignored' }
        ]
      })
    )

    expect(outcome.dropped).toBe(14)
    expect(outcome.entries).toEqual([{ iso: '2026-02-15', name: '春节', isOffDay: true }])
  })

  it('lets a later entry win a repeated date and counts the superseded one', () => {
    const outcome = expectUsable(
      normalizeHolidayPayload({
        year: 2026,
        days: [
          { name: '旧', date: '2026-05-01', isOffDay: true },
          { name: '新', date: '2026-05-01', isOffDay: false }
        ]
      })
    )

    expect(outcome.entries).toEqual([{ iso: '2026-05-01', name: '新', isOffDay: false }])
    expect(outcome.dropped).toBe(1)
  })

  it('accepts an empty days array as a usable, empty payload', () => {
    // Upstream 2027.json is exactly this shape until the arrangement is announced.
    const outcome = expectUsable(normalizeHolidayPayload({ year: 2027, papers: [], days: [] }))
    expect(outcome.entries).toEqual([])
    expect(outcome.dropped).toBe(0)
  })

  it('cannot be polluted through __proto__ or constructor keys', () => {
    const hostile = JSON.parse(
      '{"year":2026,"days":[],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'
    ) as unknown

    expect(expectUsable(normalizeHolidayPayload(hostile)).entries).toEqual([])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  describe('the one-year spill window', () => {
    it('accepts a December date that belongs to the next year/s document', () => {
      // Lifted verbatim from real upstream data: 2019.json carries 2018-12-29/30/31.
      const outcome = expectUsable(
        normalizeHolidayPayload({
          year: 2019,
          days: [
            { name: '元旦', date: '2018-12-29', isOffDay: false },
            { name: '元旦', date: '2018-12-30', isOffDay: true }
          ]
        })
      )

      expect(outcome.spill).toBe(2)
      expect(outcome.dropped).toBe(0)
      expect(outcome.entries.map((entry) => entry.iso)).toEqual(['2018-12-29', '2018-12-30'])
    })

    it('accepts a date in the declared year + 1', () => {
      const outcome = expectUsable(
        normalizeHolidayPayload({
          year: 2025,
          days: [{ name: '元旦', date: '2026-01-01', isOffDay: true }]
        })
      )

      expect(outcome.spill).toBe(1)
      expect(outcome.entries).toEqual([{ iso: '2026-01-01', name: '元旦', isOffDay: true }])
    })

    it('rejects a date two years from the declared year', () => {
      const outcome = expectUsable(
        normalizeHolidayPayload({
          year: 2026,
          days: [
            { name: '元旦', date: '2024-01-01', isOffDay: true },
            { name: '元旦', date: '2028-01-01', isOffDay: true }
          ]
        })
      )

      expect(outcome.entries).toEqual([])
      expect(outcome.dropped).toBe(2)
      expect(outcome.spill).toBe(0)
    })
  })
})

describe('buildHolidayOverlay', () => {
  it('indexes by ISO date and reports the years it really covers', () => {
    const { overlay, errors } = buildHolidayOverlay([readFixture(2025), readFixture(2026)])

    expect(errors).toEqual([])
    expect(overlay.years).toEqual([2025, 2026])
    expect(overlay.byIso.size).toBe(72) // 33 + 39
    expect(overlay.dropped).toBe(0)
    expect(overlay.spill).toBe(0)
    expect(overlay.byIso.get('2026-09-25')).toEqual({
      iso: '2026-09-25',
      name: '中秋节',
      isOffDay: true
    })
    expect(overlay.byIso.get('1999-10-01')).toBeUndefined()
  })

  it('keeps the good payloads when one payload is unusable', () => {
    const { overlay, errors } = buildHolidayOverlay([{ year: 2026 }, readFixture(2026)])

    expect(errors).toHaveLength(1)
    expect(overlay.byIso.size).toBe(39)
    expect(overlay.years).toEqual([2026])
  })

  it('lets the later payload win a shared date', () => {
    const { overlay, errors } = buildHolidayOverlay([
      { year: 2026, days: [{ name: '旧', date: '2026-05-01', isOffDay: true }] },
      { year: 2026, days: [{ name: '新', date: '2026-05-01', isOffDay: false }] }
    ])

    expect(errors).toEqual([])
    expect(overlay.byIso.get('2026-05-01')).toEqual({
      iso: '2026-05-01',
      name: '新',
      isOffDay: false
    })
    expect(overlay.dropped).toBe(1)
  })

  it('reports the calendar year a spill-only payload covers', () => {
    const { overlay } = buildHolidayOverlay([
      { year: 2026, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] }
    ])

    expect(overlay.years).toEqual([2027])
    expect(overlay.spill).toBe(1)
  })
})

describe('resolveHoliday', () => {
  const overlayOf = (payloads: readonly unknown[]) => buildHolidayOverlay(payloads).overlay

  it('inverts the source isOffDay flag into HolidayRef.isWork', () => {
    const overlay = overlayOf([readFixture(2026)])

    // Reading the fixture: 春节 rests on 02-15 and works a makeup day on 02-14.
    expect(resolveHoliday(null, overlay, '2026-02-15')).toEqual({ name: '春节', isWork: false })
    expect(resolveHoliday(null, overlay, '2026-02-14')).toEqual({ name: '春节', isWork: true })
    // 国庆 rests on 10-01 and works a makeup day on 10-10.
    expect(resolveHoliday(null, overlay, '2026-10-01')).toEqual({ name: '国庆节', isWork: false })
    expect(resolveHoliday(null, overlay, '2026-10-10')).toEqual({ name: '国庆节', isWork: true })
  })

  it('falls back to the engine value, by reference, when the overlay is silent', () => {
    const overlay = overlayOf([readFixture(2026)])
    const engine: HolidayRef = { name: '劳动节', isWork: false }

    expect(resolveHoliday(engine, overlay, '2024-05-01')).toBe(engine)
    // One day past the last fixture entry: still the engine's answer.
    expect(resolveHoliday(engine, overlay, '2026-10-11')).toBe(engine)
    expect(resolveHoliday(null, overlay, '2026-10-11')).toBeNull()
  })

  it('returns the engine null unchanged beyond the overlay coverage', () => {
    const overlay = overlayOf([readFixture(2025), readFixture(2026)])

    expect(resolveHoliday(null, overlay, '2027-01-01')).toBeNull()
    expect(resolveHoliday(null, overlay, '1999-10-01')).toBeNull()
    expect(resolveHoliday(null, overlay, '2050-02-01')).toBeNull()
  })
})

describe('the engine resolves through the overlay', () => {
  it('overrides the built-in table inside its own range', () => {
    // warming the memo first is the point: the override must survive it.
    expect(buildDaySummary(key(2026, 10, 1)).holiday).toEqual({ name: '国庆节', isWork: false })

    const errors = installHolidayPayloads([
      { year: 2026, days: [{ name: '覆盖测试', date: '2026-10-01', isOffDay: false }] }
    ])

    expect(errors).toEqual([])
    expect(buildDaySummary(key(2026, 10, 1)).holiday).toEqual({ name: '覆盖测试', isWork: true })
  })

  it('supplies a day the frozen table cannot know', () => {
    expect(buildDaySummary(key(2027, 1, 1)).holiday).toBeNull()

    installHolidayPayloads([
      { year: 2026, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] }
    ])

    expect(buildDaySummary(key(2027, 1, 1)).holiday).toEqual({ name: '元旦', isWork: false })
  })

  it('leaves the built-in table alone for dates the overlay does not mention', () => {
    installHolidayPayloads([readFixture(2026)])

    // These are the conformance suite's own values, reached through the overlay
    // path: 2011-05-01 was never in the 2026 snapshot.
    expect(buildDaySummary(key(2011, 5, 1)).holiday).toEqual({ name: '劳动节', isWork: false })
    expect(buildDaySummary(key(2024, 2, 4)).holiday).toEqual({ name: '春节', isWork: true })
  })

  it('drops the heavier info cache as well', () => {
    buildDayInfo(key(2026, 6, 26))

    installHolidayPayloads([
      { year: 2026, days: [{ name: '覆盖测试', date: '2026-06-26', isOffDay: false }] }
    ])

    expect(buildDayInfo(key(2026, 6, 26)).holiday).toEqual({ name: '覆盖测试', isWork: true })
  })

  it('rebuilds the year overview when the overlay changes', () => {
    expect(buildYearInfo(2027).holidays).toEqual([])

    installHolidayPayloads([
      { year: 2026, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] }
    ])

    expect(buildYearInfo(2027).holidays).toEqual([
      { month: 1, day: 1, name: '元旦', isWork: false }
    ])
  })

  it('forgets the overlay and its memoized results on reset', () => {
    installHolidayPayloads([
      { year: 2026, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] }
    ])
    expect(buildDaySummary(key(2027, 1, 1)).holiday).not.toBeNull()

    resetHolidayOverlay()

    expect(buildDaySummary(key(2027, 1, 1)).holiday).toBeNull()
  })

  it('keeps the conformance expectation that years outside the data stay null', () => {
    // The fixture overlay is installed, and must still invent nothing.
    installHolidayPayloads([readFixture(2025), readFixture(2026)])

    expect(buildDaySummary(key(1999, 10, 1)).holiday).toBeNull()
    expect(buildDaySummary(key(2050, 2, 1)).holiday).toBeNull()
    // Past the built-in table's 2026-10-10 end and absent from the 2026 fixture.
    expect(buildDaySummary(key(2026, 10, 11)).holiday).toBeNull()
  })
})

describe('overlay change notifications', () => {
  it('notifies subscribers once per change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = onHolidayOverlayChange(listener)
    const before = getHolidayOverlayVersion()

    installHolidayPayloads([readFixture(2026)])

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getHolidayOverlayVersion()).toBe(before + 1)

    unsubscribe()
    resetHolidayOverlay()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getHolidayOverlayVersion()).toBe(before + 2)
  })

  it('exposes the installed overlay', () => {
    expect(getHolidayOverlay().byIso.size).toBe(0)

    const overlay = buildHolidayOverlay([readFixture(2026)]).overlay
    setHolidayOverlay(overlay)

    expect(getHolidayOverlay()).toBe(overlay)
  })
})
