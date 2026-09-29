import { useMemo, type ReactElement, type ReactNode } from 'react'
import {
  buildDayInfo,
  formatFullDate,
  weekDayLabel,
  type DateKey,
  type DayInfo,
  type GlossaryFamily
} from '@core'
import { TermTip } from '@renderer/components/TermTip'
import { useMessages, type Messages } from '@renderer/i18n'
import { useSettings } from '@renderer/state/settings-context'
import './day-panel.css'

interface DayPanelProps {
  selected: DateKey
}

/** 一行值对应的术语。有它才会挂上浮层，没有就当普通文字渲染。 */
interface TermRef {
  family: GlossaryFamily
  name: string
}

/** 一个标签/值 + 它的术语家族。`value` 为空表示引擎推不出来，整行不渲染。 */
type RowSpec = [label: string, value: string | null, term: TermRef | undefined]

/** A label/value line. Renders nothing when the engine could not derive a value. */
function Row({
  label,
  value,
  term
}: {
  label: string
  value: string | null | undefined
  term?: TermRef
}): ReactElement | null {
  if (!value) return null
  return (
    <div className="almanac-row">
      <dt>{label}</dt>
      <dd>
        {term ? (
          <TermTip family={term.family} name={term.name}>
            {value}
          </TermTip>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="almanac-section">
      <h3 className="almanac-section__title">{title}</h3>
      {children}
    </section>
  )
}

function ChipList({
  items,
  tone,
  family
}: {
  items: readonly string[] | null
  tone: 'luck' | 'avoid'
  /** 有家族时每个 chip 都带释义浮层；没有词条的条目自动退化成纯文本。 */
  family?: GlossaryFamily
}): ReactElement | null {
  if (items === null || items.length === 0) return null
  return (
    <ul className={`chips chips--${tone}`}>
      {items.map((item) => (
        <li key={item} className="chip">
          {family ? <TermTip family={family} name={item} /> : item}
        </li>
      ))}
    </ul>
  )
}

/** Fields that are always available, shown right under the header. */
function buildFacts(info: DayInfo, t: Messages): RowSpec[] {
  const f = t.dayPanel.facts
  const pillar = info.ganzhi
  return [
    [f.ganzhi, pillar ? `${pillar.year} ${pillar.month} ${pillar.day}` : null, undefined],
    [f.sound, pillar?.daySound ?? null, undefined],
    [
      f.element,
      pillar?.dayElement ?? null,
      pillar?.dayElement ? { family: 'fiveElement', name: pillar.dayElement } : undefined
    ],
    [f.zodiac, info.lunar.zodiac, undefined],
    [f.constellation, info.constellation, undefined],
    [f.phase, info.phase, info.phase ? { family: 'phase', name: info.phase } : undefined]
  ]
}

/** The almanac block: terms, season markers, star gods and the day's 建除. */
function buildAlmanacRows(info: DayInfo, t: Messages): RowSpec[] {
  const f = t.dayPanel.facts
  const star = info.twentyEightStar
  return [
    [
      f.term,
      info.currentTerm ? `${info.currentTerm.name} 第${info.currentTerm.dayIndex + 1}天` : null,
      undefined
    ],
    [f.phenology, info.phenology, undefined],
    [f.nineDay, info.nineDay, undefined],
    [f.dogDay, info.dogDay, undefined],
    [f.plumRain, info.plumRainDay, undefined],
    [f.duty, info.duty, info.duty ? { family: 'duty', name: info.duty } : undefined],
    [
      f.twelveStar,
      info.twelveStar,
      info.twelveStar ? { family: 'twelveStar', name: info.twelveStar } : undefined
    ],
    [f.sixStar, info.sixStar, info.sixStar ? { family: 'sixStar', name: info.sixStar } : undefined],
    [
      f.nineStar,
      info.nineStar,
      info.nineStar ? { family: 'nineStar', name: info.nineStar } : undefined
    ],
    [f.fetus, info.fetus, undefined],
    [
      f.star28,
      star ? `${star.name}宿（${star.zone}方${star.beast}）· ${star.luck}` : null,
      star ? { family: 'star28', name: star.name } : undefined
    ],
    [
      f.minorRen,
      info.minorRen,
      info.minorRen ? { family: 'minorRen', name: info.minorRen } : undefined
    ],
    [f.pengZu, info.ganzhi?.pengZu ?? null, undefined]
  ]
}

export function DayPanel({ selected }: DayPanelProps): ReactElement {
  const { settings } = useSettings()
  const t = useMessages()
  const info = useMemo(() => buildDayInfo(selected), [selected])

  const tags: Array<{ text: string; term?: TermRef }> = [
    info.term ? { text: info.term.name, term: { family: 'term', name: info.term.name } } : null,
    ...info.festivals.map((festival) => ({ text: festival.name })),
    info.holiday
      ? {
          text: `${info.holiday.name}(${
            info.holiday.isWork ? t.dayPanel.holidayWork : t.dayPanel.holidayRest
          })`
        }
      : null
  ].filter((tag): tag is { text: string; term?: TermRef } => tag !== null)

  const luckGods = info.gods?.filter((god) => god.luck === 'good').map((god) => god.name) ?? null
  const evilGods = info.gods?.filter((god) => god.luck === 'bad').map((god) => god.name) ?? null

  return (
    <aside className="day-panel" aria-label={t.dayPanel.title}>
      <header className="day-panel__header">
        <p className="day-panel__date">
          {formatFullDate(selected.year, selected.month, selected.day)}
        </p>
        <p className="day-panel__week">
          {t.dayPanel.weekdayPrefix}
          {weekDayLabel(info.weekDay) || info.weekName}
        </p>
        <p className="day-panel__lunar">{info.lunar.full}</p>
      </header>

      {tags.length > 0 ? (
        <div className="day-panel__tags">
          {tags.map((tag) => (
            <span key={tag.text} className="tag">
              {tag.term ? (
                <TermTip family={tag.term.family} name={tag.term.name}>
                  {tag.text}
                </TermTip>
              ) : (
                tag.text
              )}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="almanac">
        {buildFacts(info, t).map(([label, value, term]) => (
          <Row key={label} label={label} value={value} term={term} />
        ))}
      </dl>

      {settings.showAlmanac ? (
        <>
          <Section title={t.dayPanel.recommends}>
            {info.recommends === null ? (
              <p className="almanac-note">{t.dayPanel.outOfRange}</p>
            ) : (
              <ChipList items={info.recommends} tone="luck" family="taboo" />
            )}
          </Section>

          <Section title={t.dayPanel.avoids}>
            <ChipList items={info.avoids} tone="avoid" family="taboo" />
          </Section>

          <Section title={t.dayPanel.almanac}>
            <dl className="almanac">
              {buildAlmanacRows(info, t).map(([label, value, term]) => (
                <Row key={label} label={label} value={value} term={term} />
              ))}
            </dl>
          </Section>

          <Section title={t.dayPanel.gods}>
            <div className="almanac-gods">
              <ChipList items={luckGods} tone="luck" family="god" />
              <ChipList items={evilGods} tone="avoid" family="god" />
            </div>
          </Section>
        </>
      ) : null}
    </aside>
  )
}
