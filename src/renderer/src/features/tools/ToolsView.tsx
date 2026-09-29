import { useMemo, useState, type ReactElement } from 'react'
import { SegmentedControl, type SegmentedOption } from '@renderer/components/SegmentedControl'
import { useMessages } from '@renderer/i18n'
import { ConverterTool } from './ConverterTool'
import { SearchTool } from './SearchTool'
import { PillarsTool } from '@renderer/features/pillars/PillarsTool'
import type { DateKey } from '@core'
import './tools.css'

type ToolId = 'converter' | 'search' | 'pillars'

interface ToolsViewProps {
  selected: DateKey
  onSelect: (key: DateKey) => void
  onOpenMonth: (year: number, month: number) => void
}

export function ToolsView({ selected, onSelect, onOpenMonth }: ToolsViewProps): ReactElement {
  const t = useMessages()
  const [tool, setTool] = useState<ToolId>('converter')

  // 选项文案随语言变化，所以不能是模块级常量（那样只在 import 时求值一次）。
  const options = useMemo<readonly SegmentedOption<ToolId>[]>(
    () => [
      { value: 'converter', label: t.tools.converter },
      { value: 'search', label: t.tools.search },
      { value: 'pillars', label: t.tools.pillars }
    ],
    [t]
  )

  return (
    <div className="tools-view">
      <div className="tools-view__nav">
        <SegmentedControl label={t.tools.label} value={tool} options={options} onChange={setTool} />
      </div>

      {tool === 'converter' ? (
        <ConverterTool selected={selected} />
      ) : tool === 'search' ? (
        <SearchTool selected={selected} onSelect={onSelect} onOpenMonth={onOpenMonth} />
      ) : (
        <PillarsTool selected={selected} />
      )}
    </div>
  )
}
