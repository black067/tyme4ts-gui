import type { ReactElement } from 'react'
import { EARTH_BRANCHES, HEAVEN_STEMS } from '@core'
import { TermTip } from './TermTip'

/**
 * 干支串（如「甲辰」或「甲辰 戊辰 甲辰」），逐字挂术语浮层。
 *
 * 十干与十二支是两族词条，靠字本身分流：干字必在十干表里，支字必在十二支表里。
 * 不在任一张表里的字符（空格、分隔符）按纯文本渲染，所以调用方不必先切分。
 *
 * 为什么逐字而不是整串：干支没有「整体释义」——它的含义来自干与支各自的那句训诂
 * （甲者言万物剖符甲而出也、辰者言万物之蜄也）。整串引不出可校验的定义句。
 */
export function GanzhiText({ value }: { value: string }): ReactElement {
  return (
    <>
      {[...value].map((character, index) => {
        // 用字符本身作 key 会冲突（「甲辰 戊辰 甲辰」里 甲/辰 各出现三次），
        // 所以带上位置。
        const key = `${index}-${character}`
        if (HEAVEN_STEMS.has(character)) {
          return (
            <TermTip key={key} family="heavenStem" name={character}>
              {character}
            </TermTip>
          )
        }
        if (EARTH_BRANCHES.has(character)) {
          return (
            <TermTip key={key} family="earthBranch" name={character}>
              {character}
            </TermTip>
          )
        }
        return <span key={key}>{character}</span>
      })}
    </>
  )
}
