/**
 * 文案层的契约。
 *
 * 设计要点：
 *
 * 1. **键的类型由参考文案推导**（`typeof zhHans`，见 `messages/index.ts`），
 *    所以 Messages 永远与 `messages/zh-Hans.ts` 同构；新增语言时缺键会编译失败，
 *    不需要手写一遍键的清单。
 * 2. **`Intl` 不参与**。日期与数字由应用自己用模板拼装，因为历法日期是
 *    「农历 + 节气 + 干支」这类引擎产出的中文片段组合，`Intl.DateTimeFormat`
 *    表达不了；详见 `i18n/format.ts`。
 * 3. **带参数的文案直接写成函数**，不用 `{name}` 占位符：
 *    占位符写错只有运行时才暴露，而函数参数由 TypeScript 检查；
 *    语序、量词、复数的差异也因此能各写各的。
 */

/** 翻译函数：接收某条文案所需的参数。函数而非占位符模板，理由见文件头。 */
export type Translate<Params = void> = [Params] extends [void]
  ? () => string
  : (params: Params) => string
