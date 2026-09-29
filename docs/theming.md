# 主题开发

主题由 CSS 自定义属性（design token）驱动，新增主题**无需改动任何业务组件**。

## 模型

- **主题族（family）**：`minimal`（现代简约）、`classic`（中国传统）。id 持久化在设置里。
- **变体（variant）**：每一个主题族都必须同时提供 `light` 与 `dark`。
- **外观（appearance）**：`system` / `light` / `dark`，负责在主题族内选变体。

`ThemeProvider` 只往 `<html>` 写 `data-theme="<family>-<variant>"`，其余全部由 CSS 决定；
未知的主题 id 会回退到默认族。

## 新增一个主题

1. 在 `src/renderer/src/theme/themes/` 下新增一个定义文件，导出 `ThemeDefinition`；
2. 在 `src/renderer/src/theme/themes/index.ts` 中注册；
3. 在 `src/renderer/src/theme/tokens.css` 中，为 `variants.light` / `variants.dark` 声明的两个
   名称各写一个 `:root[data-theme='<该名称>']` 规则块（既有的族用的是 `<family>-light` /
   `<family>-dark`）。

## 被测试强制的两条约束

`tests/theme-tokens.test.ts` 直接用 `node:fs` 读源码树，`npm test` 时会跑：

- `components/`、`features/`、`state/`、`styles/` 目录下**不得出现** `#rrggbb` / `rgb()`
  字面量——颜色只能来自 token；
- 每个声明的 variant 都必须有规则块，且必须定义同一套 `--color-*` / `--shadow-*` token。

第二条是「换主题不用改组件」的前提：两个族的 token 集合必须完全一致，否则切换时会出现
未定义的属性。

## 为什么用 CSS 变量而不是 JS 主题对象

渲染进程的组件只认语义 token（`--color-surface`、`--color-text-muted`…），因此新增主题是纯
CSS 工作，不触发 React 重渲染，也不需要重建样式表。代价是 token 集合必须靠测试守住一致性。
