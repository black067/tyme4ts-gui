import type { ReactElement } from 'react'
import type { AppearanceMode } from '@shared/ipc'
import { SegmentedControl, type SegmentedOption } from '@renderer/components/SegmentedControl'
import { Toggle } from '@renderer/components/Toggle'
import { useSettings } from '@renderer/state/settings-context'
import { useTheme } from '@renderer/theme/theme-context'
import { THEMES } from '@renderer/theme/themes'
import './settings-bar.css'

const APPEARANCE_OPTIONS: readonly SegmentedOption<AppearanceMode>[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

export function SettingsBar(): ReactElement {
  const { settings, update } = useSettings()
  const { theme, resolvedThemeId } = useTheme()

  const themeOptions: readonly SegmentedOption<string>[] = THEMES.map((candidate) => ({
    value: candidate.id,
    label: candidate.name
  }))

  return (
    <section className="settings-bar" aria-label="外观与显示设置">
      <SegmentedControl
        label="主题"
        value={theme.id}
        options={themeOptions}
        onChange={(themeId) => update({ themeId })}
      />

      <SegmentedControl
        label="外观"
        value={settings.appearance}
        options={APPEARANCE_OPTIONS}
        onChange={(appearance) => update({ appearance })}
      />

      <Toggle
        label="周一为一周首日"
        checked={settings.weekStartsOnMonday}
        onChange={(weekStartsOnMonday) => update({ weekStartsOnMonday })}
      />

      <Toggle
        label="显示黄历"
        checked={settings.showAlmanac}
        onChange={(showAlmanac) => update({ showAlmanac })}
      />

      <span className="settings-bar__resolved" title="当前生效的主题标识">
        {theme.name} · {resolvedThemeId}
      </span>
    </section>
  )
}
