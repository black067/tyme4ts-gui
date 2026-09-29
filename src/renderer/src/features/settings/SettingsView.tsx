import { useEffect, useState, type ReactElement } from 'react'
import { LOCALES, type AppearanceMode, type AppInfo, type Locale, type ViewId } from '@shared/ipc'
import { SegmentedControl, type SegmentedOption } from '@renderer/components/SegmentedControl'
import { Toggle } from '@renderer/components/Toggle'
import { useMessages, type Messages, type ThemeNameKey } from '@renderer/i18n'
import { UpdateSection } from '@renderer/features/updates/UpdateSection'
import { HolidaySection } from '@renderer/features/holidays/HolidaySection'
import { useSettings } from '@renderer/state/settings-context'
import { useTheme } from '@renderer/theme/theme-context'
import { THEMES } from '@renderer/theme/themes'
import { ASSET_CREDITS, THIRD_PARTY } from './third-party'
import './settings-view.css'

// 选项文案做成 t 的函数而不是模块级常量：常量在 import 时求值，
// 切换语言后不会更新。
const appearanceOptions = (t: Messages): readonly SegmentedOption<AppearanceMode>[] => [
  { value: 'system', label: t.settings.appearance.system },
  { value: 'light', label: t.settings.appearance.light },
  { value: 'dark', label: t.settings.appearance.dark }
]

const startViewOptions = (t: Messages): readonly SegmentedOption<ViewId>[] => [
  { value: 'month', label: t.nav.month },
  { value: 'year', label: t.nav.year },
  { value: 'timeline', label: t.nav.timeline },
  { value: 'tools', label: t.nav.tools }
]

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactElement | ReactElement[]
}): ReactElement {
  return (
    <section className="settings-section">
      <h3 className="settings-section__title">{title}</h3>
      {description ? <p className="settings-section__desc">{description}</p> : null}
      <div className="settings-section__body">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="settings-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function SettingsView({ onClose }: { onClose: () => void }): ReactElement {
  const { settings, update } = useSettings()
  const { theme, resolvedThemeId } = useTheme()
  const t = useMessages()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    window.tyme.app
      .getInfo()
      .then((loaded) => {
        if (!cancelled) setInfo(loaded)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // 主题名与说明取自文案目录。主题是纯定义（id + 变体 + 预览色），把界面文案
  // 留在 ThemeDefinition 里会让"换个语言"变成要改领域类型。
  const themeName = (id: string): string =>
    t.settings.appearance.themeNames[id as ThemeNameKey] ?? id

  const themeOptions: readonly SegmentedOption<string>[] = THEMES.map((candidate) => ({
    value: candidate.id,
    label: themeName(candidate.id)
  }))

  // 选项文案取自参考目录的 `localeNames`，而不是在这里再写一遍中文——
  // 语言名在切换语言后仍有意义（否则英文界面里找不到"繁體中文"这一项）。
  const localeOptions: readonly SegmentedOption<Locale>[] = LOCALES.map((value) => ({
    value,
    label: t.localeNames[value]
  }))

  return (
    <section className="settings-view" aria-label={t.settings.label}>
      <header className="settings-view__header">
        <h2 className="settings-view__title">{t.settings.title}</h2>
        <button type="button" className="text-button" onClick={onClose}>
          {t.settings.close}
        </button>
      </header>

      <div className="settings-view__body">
        <Section title={t.settings.appearance.title}>
          <div className="settings-field">
            <span className="settings-field__label">{t.settings.appearance.themeLabel}</span>
            <SegmentedControl
              label=""
              value={theme.id}
              options={themeOptions}
              onChange={(themeId) => update({ themeId })}
            />
          </div>
          <div className="settings-field">
            <span className="settings-field__label">{t.settings.appearance.modeLabel}</span>
            <SegmentedControl
              label=""
              value={settings.appearance}
              options={appearanceOptions(t)}
              onChange={(appearance) => update({ appearance })}
            />
          </div>
          <p className="settings-note">
            {t.settings.appearance.current({
              theme: themeName(theme.id),
              resolved: resolvedThemeId
            })}
          </p>
        </Section>

        <Section title={t.settings.language.title}>
          <div className="settings-field">
            <SegmentedControl
              label={t.settings.language.title}
              value={settings.locale}
              options={localeOptions}
              onChange={(locale) => update({ locale })}
            />
          </div>
        </Section>

        <Section title={t.settings.display.title}>
          <div className="settings-field">
            <Toggle
              label={t.settings.display.weekStart}
              checked={settings.weekStartsOnMonday}
              onChange={(weekStartsOnMonday) => update({ weekStartsOnMonday })}
            />
          </div>
          <div className="settings-field">
            <Toggle
              label={t.settings.display.almanac}
              checked={settings.showAlmanac}
              onChange={(showAlmanac) => update({ showAlmanac })}
            />
          </div>
          <div className="settings-field">
            <Toggle
              label={t.settings.display.glossary}
              checked={settings.showGlossary}
              onChange={(showGlossary) => update({ showGlossary })}
            />
          </div>
          <div className="settings-field">
            <span className="settings-field__label">{t.settings.display.startViewLabel}</span>
            <SegmentedControl
              label=""
              value={settings.defaultView}
              options={startViewOptions(t)}
              onChange={(defaultView) => update({ defaultView })}
            />
          </div>
        </Section>

        <Section title={t.settings.updates.title}>
          <UpdateSection />
        </Section>

        <Section title={t.settings.data.title}>
          <dl className="settings-rows">
            <Row label={t.settings.data.dir} value={info?.userDataPath ?? t.common.pending} />
            <Row
              label={t.settings.data.file}
              value={info ? `${info.userDataPath}\\settings.json` : t.common.pending}
            />
          </dl>
        </Section>

        <Section title={t.settings.holidays.title}>
          <HolidaySection />
        </Section>

        <Section title={t.settings.author.title}>
          <dl className="settings-rows">
            <Row
              label={t.settings.author.app}
              value={info ? `${info.name} v${info.version}` : t.common.pending}
            />
            <Row label={t.settings.author.name} value={info?.author || t.settings.author.missing} />
          </dl>
        </Section>

        <Section title={t.settings.thirdParty.title}>
          <ul className="credits">
            {THIRD_PARTY.map((entry) => (
              <li key={entry.name} className="credit">
                <div className="credit__head">
                  <span className="credit__name">{entry.name}</span>
                  <span className="credit__licence">{entry.licence}</span>
                </div>
                <p className="credit__usage">{t.settings.thirdParty.usage[entry.usageKey]}</p>
                <a
                  className="credit__link"
                  href={entry.homepage}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {entry.homepage}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t.settings.assets.title}>
          <ul className="credits">
            {ASSET_CREDITS.map((credit) => (
              <li key={credit.path} className="credit">
                <div className="credit__head">
                  <span className="credit__name">{t.settings.assets.names[credit.nameKey]}</span>
                  <span className="credit__licence">{t.settings.assets.licence.seeSourcePage}</span>
                </div>
                <p className="credit__usage">
                  {t.settings.assets.authorLabel}：{credit.author}
                  <br />
                  {t.settings.assets.licence.label}：{t.settings.assets.licence.seeSourcePage}
                  <br />
                  {t.settings.assets.fileLabel}：<code>{credit.path}</code>
                </p>
                <a
                  className="credit__link"
                  href={credit.source}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {credit.source}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t.settings.runtime.title}>
          <dl className="settings-rows">
            <Row label="Electron" value={info?.electron ?? t.common.pending} />
            <Row label="Chromium" value={info?.chrome ?? t.common.pending} />
            <Row label="Node.js" value={info?.node ?? t.common.pending} />
          </dl>
        </Section>
      </div>
    </section>
  )
}
