import type { ReactElement } from 'react'
import { cx } from './cx'

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ label, checked, onChange }: ToggleProps): ReactElement {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        className="toggle__input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={cx('toggle__track', checked && 'is-on')} aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__label">{label}</span>
    </label>
  )
}
