import { useMemo, type ReactElement, type ReactNode } from 'react'
import { buildDayInfo, formatFullDate, weekDayLabel, type DateKey, type DayInfo } from '@core'
import { useSettings } from '@renderer/state/settings-context'
import './day-panel.css'

interface DayPanelProps {
  selected: DateKey
}

/** A label/value line. Renders nothing when the engine could not derive a value. */
function Row({
  label,
  value
}: {
  label: string
  value: string | null | undefined
}): ReactElement | null {
  if (!value) return null
  return (
    <div className="almanac-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
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
  tone
}: {
  items: readonly string[] | null
  tone: 'luck' | 'avoid'
}): ReactElement | null {
  if (items === null || items.length === 0) return null
  return (
    <ul className={`chips chips--${tone}`}>
      {items.map((item) => (
        <li key={item} className="chip">
          {item}
        </li>
      ))}
    </ul>
  )
}

/** Fields that are always available, shown right under the header. */
function buildFacts(info: DayInfo): Array<[string, string | null]> {
  const pillar = info.ganzhi
  return [
    ['干支', pillar ? `${pillar.year} ${pillar.month} ${pillar.day}` : null],
    ['纳音', pillar?.daySound ?? null],
    ['五行', pillar?.dayElement ?? null],
    ['生肖', info.lunar.zodiac],
    ['星座', info.constellation],
    ['月相', info.phase]
  ]
}

/** The almanac block: terms, season markers, star gods and the day's 建除. */
function buildAlmanacRows(info: DayInfo): Array<[string, string | null]> {
  const star = info.twentyEightStar
  return [
    [
      '节气',
      info.currentTerm ? `${info.currentTerm.name} 第${info.currentTerm.dayIndex + 1}天` : null
    ],
    ['物候', info.phenology],
    ['数九', info.nineDay],
    ['三伏', info.dogDay],
    ['梅雨', info.plumRainDay],
    ['建除', info.duty],
    ['十二神', info.twelveStar],
    ['六曜', info.sixStar],
    ['九星', info.nineStar],
    ['胎神', info.fetus],
    ['二十八宿', star ? `${star.name}宿（${star.zone}方${star.beast}）· ${star.luck}` : null],
    ['小六壬', info.minorRen],
    ['彭祖百忌', info.ganzhi?.pengZu ?? null]
  ]
}

export function DayPanel({ selected }: DayPanelProps): ReactElement {
  const { settings } = useSettings()
  const info = useMemo(() => buildDayInfo(selected), [selected])

  const tags = [
    info.term?.name,
    ...info.festivals.map((festival) => festival.name),
    info.holiday ? `${info.holiday.name}(${info.holiday.isWork ? '班' : '休'})` : null
  ].filter((tag): tag is string => typeof tag === 'string')

  const luckGods = info.gods?.filter((god) => god.luck === '吉').map((god) => god.name) ?? null
  const evilGods = info.gods?.filter((god) => god.luck === '凶').map((god) => god.name) ?? null

  return (
    <aside className="day-panel" aria-label="日详情">
      <header className="day-panel__header">
        <p className="day-panel__date">
          {formatFullDate(selected.year, selected.month, selected.day)}
        </p>
        <p className="day-panel__week">星期{weekDayLabel(info.weekDay) || info.weekName}</p>
        <p className="day-panel__lunar">{info.lunar.full}</p>
      </header>

      {tags.length > 0 ? (
        <div className="day-panel__tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="almanac">
        {buildFacts(info).map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </dl>

      {settings.showAlmanac ? (
        <>
          <Section title="宜">
            {info.recommends === null ? (
              <p className="almanac-note">该日期超出历法可推算范围。</p>
            ) : (
              <ChipList items={info.recommends} tone="luck" />
            )}
          </Section>

          <Section title="忌">
            <ChipList items={info.avoids} tone="avoid" />
          </Section>

          <Section title="黄历">
            <dl className="almanac">
              {buildAlmanacRows(info).map(([label, value]) => (
                <Row key={label} label={label} value={value} />
              ))}
            </dl>
          </Section>

          <Section title="吉神凶煞">
            <div className="almanac-gods">
              <ChipList items={luckGods} tone="luck" />
              <ChipList items={evilGods} tone="avoid" />
            </div>
          </Section>
        </>
      ) : null}
    </aside>
  )
}
