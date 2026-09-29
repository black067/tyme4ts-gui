import { useState, type ReactElement } from 'react'
import { SegmentedControl, type SegmentedOption } from '@renderer/components/SegmentedControl'
import { ConverterTool } from './ConverterTool'
import { SearchTool } from './SearchTool'
import type { DateKey } from '@core'
import './tools.css'

type ToolId = 'converter' | 'search'

const TOOLS: readonly SegmentedOption<ToolId>[] = [
  { value: 'converter', label: '日期换算' },
  { value: 'search', label: '择日检索' }
]

interface ToolsViewProps {
  selected: DateKey
  onSelect: (key: DateKey) => void
  onOpenMonth: (year: number, month: number) => void
}

export function ToolsView({ selected, onSelect, onOpenMonth }: ToolsViewProps): ReactElement {
  const [tool, setTool] = useState<ToolId>('converter')

  return (
    <div className="tools-view">
      <div className="tools-view__nav">
        <SegmentedControl label="工具" value={tool} options={TOOLS} onChange={setTool} />
      </div>

      {tool === 'converter' ? (
        <ConverterTool selected={selected} />
      ) : (
        <SearchTool selected={selected} onSelect={onSelect} onOpenMonth={onOpenMonth} />
      )}
    </div>
  )
}
