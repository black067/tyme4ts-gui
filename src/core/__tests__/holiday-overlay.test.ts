/**
 * Holiday overlay tests.
 *
 * The two fixtures are verbatim upstream snapshots of `vsme/chinese-days`
 * (see `scripts/glossary/fetch-holidays.mjs`), so nothing here touches the
 * network. Everything goes through the `@core` facade on purpose: these tests
 * also prove the overlay is exported and that `day.ts` / `year.ts` are genuinely
 * wired to it, not merely that the pure helpers agree with themselves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture2025 from '../../../tests/fixtures/chinese-days/2025.json'
import fixture2026 from '../../../tests/fixtures/chinese-days/2026.json'
import {
  buildDayInfo,
  buildDaySummary,
  buildHolidayOverlay,
  buildYearInfo,
  decideHolidayError,
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
      name: '国庆节',
      isOffDay: false
    })
  })

  it('reads the name out of "<英文名>,<中文名>,<薪资倍数>" and ignores the rest', () => {
    const outcome = expectUsable(
      normalizeHolidayPayload({
        holidays: { '2026-05-01': 'Labour Day,劳动节,2' },
        workdays: { '2026-05-09': 'Labour Day,劳动节,2' }
      })
    )

    // 只取中文名，且与引擎的词汇对齐：两边说法一致，才不会在同一天出现两种名字。
    expect(outcome.entries).toEqual([
      { iso: '2026-05-01', name: '劳动节', isOffDay: true },
      { iso: '2026-05-09', name: '劳动节', isOffDay: false }
    ])
  })

  it('expands the source abbreviations to the engine names', () => {
    // 数据源写「中秋」「端午」「清明」，引擎写「中秋节」「端午节」「清明节」；
    // 覆盖层是覆盖关系，不归一就会在引擎本来就认识的日子上换成短名。
    const outcome = expectUsable(
      normalizeHolidayPayload({
        holidays: {
          '2026-04-04': 'Tomb-sweeping Day,清明,1',
          '2026-06-19': 'Dragon Boat Festival,端午,1',
          '2026-09-25': 'Mid-autumn Festival,中秋,1',
          '2026-11-11': 'Some New Day,新节日,1' // 表里没有的原样保留
        }
      })
    )

    expect(outcome.entries.map((entry) => entry.name)).toEqual([
      '清明节',
      '端午节',
      '中秋节',
      '新节日'
    ])
  })

  it('rejects a wholly unusable payload as a value instead of throwing', () => {
    const unusable: unknown[] = [
      null,
      undefined,
      42,
      [],
      '2026-01-01',
      {}, // 两张表都没有
      { holidays: null },
      { holidays: [] }, // 表必须是对象
      { workdays: '2026-01-01' }
    ]

    for (const payload of unusable) {
      const outcome = normalizeHolidayPayload(payload)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.error).toMatch(/节假日数据/)
    }
  })

  it('refuses raw text as a payload instead of throwing on it', () => {
    // 调用方负责 JSON.parse，验收入口只接收已解析的值。字符串被当成不可用载荷
    // 拒掉，而不是抛异常——截断的响应体因此不会把主进程打崩。
    const body = JSON.stringify(fixture2026)
    expect(normalizeHolidayPayload(body)).toMatchObject({ ok: false })
    expect(normalizeHolidayPayload(body.slice(0, 120))).toMatchObject({ ok: false })
  })

  it('drops every malformed date and counts them', () => {
    const outcome = expectUsable(
      normalizeHolidayPayload(
        {
          holidays: {
            '2026-02-15': 'Spring Festival,春节,4', // 唯一一条合法
            '2026-2-15': 'Spring Festival,春节,4', // 未补零
            '2026-02-30': 'Spring Festival,春节,4', // 没有这一天
            '2026-13-01': 'Spring Festival,春节,4', // 没有这个月
            '1582-10-06': 'Spring Festival,春节,4', // 改历空缺的那十天
            '2026-03-01': 'Spring Festival', // 缺中文名
            '2026-03-02': 'Spring Festival,,4', // 中文名为空
            '2026-03-03': 42, // 值不是字符串
            '2026-03-04': null
          }
        },
        2026
      )
    )

    expect(outcome.dropped).toBe(8)
    expect(outcome.entries).toEqual([{ iso: '2026-02-15', name: '春节', isOffDay: true }])
  })

  it('lets workdays win a date that appears in both maps', () => {
    // 同一天既在 holidays 又在 workdays 是数据自相矛盾；后读的 workdays 为准，
    // 先读的那条计为 dropped，和「后写的条目胜出」是同一条规则。
    const outcome = expectUsable(
      normalizeHolidayPayload(
        {
          holidays: { '2026-05-01': 'Labour Day,劳动节,2' },
          workdays: { '2026-05-01': 'Labour Day,劳动节,2' }
        },
        2026
      )
    )

    expect(outcome.entries).toEqual([{ iso: '2026-05-01', name: '劳动节', isOffDay: false }])
    expect(outcome.dropped).toBe(1)
  })

  it('accepts a year whose two maps are both empty', () => {
    // 未公布的年份可能没有文件（404），也可能给出两张空表；两者都该是可用的空载荷。
    const outcome = expectUsable(normalizeHolidayPayload({ holidays: {}, workdays: {} }, 2027))
    expect(outcome.entries).toEqual([])
    expect(outcome.dropped).toBe(0)
  })

  it('cannot be polluted through __proto__ or constructor keys', () => {
    const hostile = JSON.parse(
      '{"holidays":{},"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'
    ) as unknown

    expect(expectUsable(normalizeHolidayPayload(hostile)).entries).toEqual([])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  describe('the one-year spill window', () => {
    it('accepts a December date that belongs to the next year document', () => {
      // 真实情况：某年的安排会把上一年 12 月末的调休日一并写进来。
      const outcome = expectUsable(
        normalizeHolidayPayload(
          {
            holidays: { '2018-12-30': "New Year's Day,元旦,1" },
            workdays: { '2018-12-29': "New Year's Day,元旦,1" }
          },
          2019
        )
      )

      expect(outcome.spill).toBe(2)
      expect(outcome.dropped).toBe(0)
      expect(outcome.entries.map((entry) => entry.iso)).toEqual(['2018-12-29', '2018-12-30'])
    })

    it('accepts a date in the declared year + 1', () => {
      const outcome = expectUsable(
        normalizeHolidayPayload({ holidays: { '2026-01-01': "New Year's Day,元旦,1" } }, 2025)
      )

      expect(outcome.spill).toBe(1)
      expect(outcome.entries).toEqual([{ iso: '2026-01-01', name: '元旦', isOffDay: true }])
    })

    it('rejects a date two years from the declared year', () => {
      const outcome = expectUsable(
        normalizeHolidayPayload(
          {
            holidays: {
              '2024-01-01': "New Year's Day,元旦,1",
              '2028-01-01': "New Year's Day,元旦,1"
            }
          },
          2026
        )
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
    const { overlay, errors } = buildHolidayOverlay([{ holidays: null }, readFixture(2026)])

    expect(errors).toHaveLength(1)
    expect(overlay.byIso.size).toBe(39)
    expect(overlay.years).toEqual([2026])
  })

  it('lets the later payload win a shared date', () => {
    const { overlay, errors } = buildHolidayOverlay([
      { holidays: { '2026-05-01': 'Labour Day,旧,2' } },
      { workdays: { '2026-05-01': 'Labour Day,新,2' } }
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
      { holidays: { '2027-01-01': "New Year's Day,元旦,1" } }
    ])

    expect(overlay.years).toEqual([2027])
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

describe('decideHolidayError', () => {
  it('stays silent when a year among several is simply not published', () => {
    // 这就是让设置页永远显示「无法获取」的那个 bug：2027 的安排还没公布，
    // 数据源对它就返回 404；把任何一年取不到都当成失败，界面就永远在报错。
    expect(
      decideHolidayError({ received: 2, failed: 1, covered: 2, usableCached: false })
    ).toBeNull()
  })

  it('stays silent when nothing was fetched but the cache already has data', () => {
    // `usableCached` 是那个 if 的另一半：它是独立条件，单独写坏时不该被发现不了。
    expect(
      decideHolidayError({ received: 0, failed: 3, covered: 0, usableCached: true })
    ).toBeNull()
  })

  it('reports a network error only when sources broke and nothing is usable', () => {
    expect(decideHolidayError({ received: 0, failed: 2, covered: 0, usableCached: false })).toBe(
      'network'
    )
  })

  it('reports invalid data when a document arrived but yielded nothing', () => {
    expect(decideHolidayError({ received: 1, failed: 0, covered: 0, usableCached: false })).toBe(
      'invalid-data'
    )
  })

  it('stays silent when nothing is published and nothing broke', () => {
    // 全新的一年、安排还没公布、缓存也是空的：正常状态，不该报错。
    expect(
      decideHolidayError({ received: 0, failed: 0, covered: 0, usableCached: false })
    ).toBeNull()
  })
})

describe('the engine resolves through the overlay', () => {
  it('uses the same 节日名 as the built-in table where both cover a day', () => {
    // 覆盖层是覆盖关系：同一天只要覆盖层有值就用覆盖层的名字。所以两边的词汇
    // 必须一致，否则引擎本来就认识的日子会被换成另一个说法。
    // 数据源用的是简称（中秋/端午/清明），`NAME_ALIASES` 负责补全——这条测试
    // 的作用是：一旦来源出现新的简称而别名表没跟上，这里就会失败。
    const before = [
      buildDaySummary(key(2026, 6, 19)).holiday,
      buildDaySummary(key(2026, 9, 25)).holiday,
      buildDaySummary(key(2026, 4, 5)).holiday
    ]
    expect(before.every((holiday) => holiday !== null)).toBe(true)

    installHolidayPayloads([readFixture(2025), readFixture(2026)])

    expect([
      buildDaySummary(key(2026, 6, 19)).holiday,
      buildDaySummary(key(2026, 9, 25)).holiday,
      buildDaySummary(key(2026, 4, 5)).holiday
    ]).toEqual(before)
  })

  it('overrides the built-in table inside its own range', () => {
    // warming the memo first is the point: the override must survive it.
    expect(buildDaySummary(key(2026, 10, 1)).holiday).toEqual({ name: '国庆节', isWork: false })

    const errors = installHolidayPayloads([
      { workdays: { '2026-10-01': 'National Day,覆盖测试,3' } }
    ])

    expect(errors).toEqual([])
    expect(buildDaySummary(key(2026, 10, 1)).holiday).toEqual({ name: '覆盖测试', isWork: true })
  })

  it('supplies a day the frozen table cannot know', () => {
    expect(buildDaySummary(key(2027, 1, 1)).holiday).toBeNull()

    installHolidayPayloads([{ holidays: { '2027-01-01': "New Year's Day,元旦,1" } }])

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

    installHolidayPayloads([{ workdays: { '2026-06-26': 'Labour Day,覆盖测试,2' } }])

    expect(buildDayInfo(key(2026, 6, 26)).holiday).toEqual({ name: '覆盖测试', isWork: true })
  })

  it('rebuilds the year overview when the overlay changes', () => {
    expect(buildYearInfo(2027).holidays).toEqual([])

    installHolidayPayloads([{ holidays: { '2027-01-01': "New Year's Day,元旦,1" } }])

    expect(buildYearInfo(2027).holidays).toEqual([
      { month: 1, day: 1, name: '元旦', isWork: false }
    ])
  })

  it('forgets the overlay and its memoized results on reset', () => {
    installHolidayPayloads([{ holidays: { '2027-01-01': "New Year's Day,元旦,1" } }])
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
