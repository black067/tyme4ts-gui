import { useEffect, useState, type ReactElement } from 'react'
import type { AppearanceMode, AppInfo, ViewId } from '@shared/ipc'
import { SegmentedControl, type SegmentedOption } from '@renderer/components/SegmentedControl'
import { Toggle } from '@renderer/components/Toggle'
import { useSettings } from '@renderer/state/settings-context'
import { useTheme } from '@renderer/theme/theme-context'
import { THEMES } from '@renderer/theme/themes'
import { ASSET_CREDITS, THIRD_PARTY } from './third-party'
import './settings-view.css'

const APPEARANCE_OPTIONS: readonly SegmentedOption<AppearanceMode>[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

const START_VIEW_OPTIONS: readonly SegmentedOption<ViewId>[] = [
  { value: 'month', label: '月视图' },
  { value: 'year', label: '年视图' },
  { value: 'timeline', label: '时间轴' },
  { value: 'tools', label: '工具' }
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

  const themeOptions: readonly SegmentedOption<string>[] = THEMES.map((candidate) => ({
    value: candidate.id,
    label: candidate.name
  }))

  return (
    <section className="settings-view" aria-label="设置">
      <header className="settings-view__header">
        <h2 className="settings-view__title">设置</h2>
        <button type="button" className="text-button" onClick={onClose}>
          返回
        </button>
      </header>

      <div className="settings-view__body">
        <Section title="外观" description="主题决定配色与字体，外观决定使用浅色还是深色变体。">
          <div className="settings-field">
            <span className="settings-field__label">主题</span>
            <SegmentedControl
              label=""
              value={theme.id}
              options={themeOptions}
              onChange={(themeId) => update({ themeId })}
            />
          </div>
          <div className="settings-field">
            <span className="settings-field__label">外观</span>
            <SegmentedControl
              label=""
              value={settings.appearance}
              options={APPEARANCE_OPTIONS}
              onChange={(appearance) => update({ appearance })}
            />
          </div>
          <p className="settings-note">
            当前生效：{theme.name} · <code>{resolvedThemeId}</code>
          </p>
        </Section>

        <Section title="显示" description="影响日历网格与黄历内容的呈现。">
          <div className="settings-field">
            <Toggle
              label="周一为一周首日"
              checked={settings.weekStartsOnMonday}
              onChange={(weekStartsOnMonday) => update({ weekStartsOnMonday })}
            />
          </div>
          <div className="settings-field">
            <Toggle
              label="显示黄历（宜忌 / 神煞 / 胎神等）"
              checked={settings.showAlmanac}
              onChange={(showAlmanac) => update({ showAlmanac })}
            />
          </div>
          <div className="settings-field">
            <Toggle
              label="术语说明（悬停看释义，点击看出处）"
              checked={settings.showGlossary}
              onChange={(showGlossary) => update({ showGlossary })}
            />
          </div>
          <div className="settings-field">
            <span className="settings-field__label">启动时打开</span>
            <SegmentedControl
              label=""
              value={settings.defaultView}
              options={START_VIEW_OPTIONS}
              onChange={(defaultView) => update({ defaultView })}
            />
          </div>
        </Section>

        <Section title="数据" description="所有设置只保存在本机，不会上传。">
          <dl className="settings-rows">
            <Row label="数据目录" value={info?.userDataPath ?? '…'} />
            <Row label="设置文件" value={info ? `${info.userDataPath}\\settings.json` : '…'} />
          </dl>
        </Section>

        <Section title="作者信息">
          <dl className="settings-rows">
            <Row label="应用" value={info ? `${info.name} v${info.version}` : '…'} />
            <Row label="作者" value={info?.author || '（package.json 未填写）'} />
          </dl>
        </Section>

        <Section title="第三方许可" description="本应用基于以下开源项目与资产构建。">
          <ul className="credits">
            {THIRD_PARTY.map((entry) => (
              <li key={entry.name} className="credit">
                <div className="credit__head">
                  <span className="credit__name">{entry.name}</span>
                  <span className="credit__licence">{entry.licence}</span>
                </div>
                <p className="credit__usage">{entry.usage}</p>
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

        <Section title="资产署名" description="应用图标等美术资源的来源与作者。">
          <ul className="credits">
            {ASSET_CREDITS.map((credit) => (
              <li key={credit.path} className="credit">
                <div className="credit__head">
                  <span className="credit__name">{credit.name}</span>
                  <span className="credit__licence">来源授权见下</span>
                </div>
                <p className="credit__usage">
                  作者：{credit.author}
                  <br />
                  许可：{credit.licence}
                  <br />
                  文件：<code>{credit.path}</code>
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

        <Section title="运行环境">
          <dl className="settings-rows">
            <Row label="Electron" value={info?.electron ?? '…'} />
            <Row label="Chromium" value={info?.chrome ?? '…'} />
            <Row label="Node.js" value={info?.node ?? '…'} />
          </dl>
        </Section>
      </div>
    </section>
  )
}
