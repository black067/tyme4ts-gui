import type { ReactElement } from 'react'
import type { ViewId } from '@shared/ipc'
import { cx } from './cx'
import './view-tabs.css'

export interface ViewTab {
  id: ViewId
  label: string
}

interface ViewTabsProps {
  tabs: readonly ViewTab[]
  active: ViewId
  onChange: (view: ViewId) => void
}

export function ViewTabs({ tabs, active, onChange }: ViewTabsProps): ReactElement {
  return (
    <nav className="view-tabs" aria-label="主视图切换">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cx('view-tabs__tab', tab.id === active && 'is-active')}
          aria-current={tab.id === active ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
