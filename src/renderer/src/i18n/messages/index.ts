/**
 * 文案目录的注册表。
 *
 * `zh-Hans` 是参考目录：`Messages` 类型由它推导，因此其它语言只要结构不一致
 * 就会在编译期失败，键的完整性另有 `tests/i18n-contract.test.ts` 断言。
 *
 * 新增一种语言只需两步：
 * 1. 在这里 import 新目录并加进 `CATALOGS`；
 * 2. 在 `@shared/ipc` 的 `Locale` 联合与 `LOCALES` 里加上它。
 * `Messages` 的类型会立刻要求新目录补齐所有键。
 */
import type { Locale } from '@shared/ipc'
import { DEFAULT_LOCALE } from '@shared/ipc'
import { zhHans } from './zh-Hans'

/** 界面上所有文案的集合。类型由参考目录推导，别手写。 */
export type Messages = typeof zhHans

/** 有显示名的主题族 id；新增主题时这里会先报错，提醒补文案。 */
export type ThemeNameKey = keyof Messages['settings']['appearance']['themeNames']

const CATALOGS: Readonly<Record<Locale, Messages>> = {
  'zh-Hans': zhHans
}

/**
 * 取某种语言的文案。
 *
 * 未知语言回退到默认目录而不是抛错：locale 来自磁盘上的设置文件，
 * 可能被手工改坏，而"界面显示默认语言"永远好过"白屏"。
 */
export function getMessages(locale: Locale): Messages {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE]
}
