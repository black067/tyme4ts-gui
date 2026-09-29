import type { ReactElement } from 'react'
import { cx } from './cx'
import './components.css'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  /** Omit when the surrounding row already carries the label. */
  label?: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange
}: SegmentedControlProps<T>): ReactElement {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {label ? <span className="segmented__label">{label}</span> : null}
      <div className="segmented__options">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cx('segmented__option', option.value === value && 'is-active')}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
