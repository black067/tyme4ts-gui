import { useState, type ReactElement } from 'react'
import { COMMON_AVOID_ITEMS, COMMON_TABOO_ITEMS, SOLAR_TERM_NAMES } from '@core'
import { cx } from '@renderer/components/cx'
import { useMessages } from '@renderer/i18n'

interface PickerGroupProps {
  label: string
  tone: 'luck' | 'avoid' | 'term'
  selected: readonly string[]
  onChange: (next: readonly string[]) => void
}

function itemsFor(tone: PickerGroupProps['tone']): readonly string[] {
  switch (tone) {
    case 'luck':
      return COMMON_TABOO_ITEMS
    case 'avoid':
      return COMMON_AVOID_ITEMS
    case 'term':
      return SOLAR_TERM_NAMES
  }
}

/**
 * A collapsed multi-select of almanac items.
 *
 * The item lists are long, so the picker shows a summary and expands on
 * demand instead of pushing the results off screen.
 */
export function PickerGroup({ label, tone, selected, onChange }: PickerGroupProps): ReactElement {
  const t = useMessages()
  const [open, setOpen] = useState(false)
  const items = itemsFor(tone)

  const toggle = (item: string): void => {
    onChange(
      selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item]
    )
  }

  return (
    <div className="picker">
      <div className="picker__head">
        <button
          type="button"
          className="picker__toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="picker__caret">{open ? '▾' : '▸'}</span>
          {label}
          {selected.length > 0 ? <span className="picker__count">{selected.length}</span> : null}
        </button>
        {selected.length > 0 ? (
          <button type="button" className="picker__clear" onClick={() => onChange([])}>
            {t.common.clear}
          </button>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <ul className={cx('chips', `chips--${tone === 'term' ? 'luck' : tone}`)}>
          {selected.map((item) => (
            <li key={item} className="chip">
              {item}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <ul className="picker__items">
          {items.map((item) => (
            <li key={item}>
              <button
                type="button"
                className={cx('picker__item', selected.includes(item) && 'is-active')}
                aria-pressed={selected.includes(item)}
                onClick={() => toggle(item)}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
