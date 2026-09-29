# holiday-cn fixtures

Verbatim snapshots of the upstream holiday-cn JSON, committed so the overlay
tests never touch the network.

| File        | Source URL                                                                  | Retrieved  |
| ----------- | --------------------------------------------------------------------------- | ---------- |
| `2025.json` | `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2025.json` | 2026-09-29 |
| `2026.json` | `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json` | 2026-09-29 |

- Upstream: <https://github.com/NateScarlet/holiday-cn> — MIT licensed,
  CI-generated daily by scraping the official 国务院办公厅 announcements on gov.cn.
- Retrieved on **2026-09-29 (Asia/Shanghai)** with `Invoke-WebRequest`; the bytes
  are unmodified, 4-space indentation included. `.prettierignore` excludes this
  directory so `npm run format:check` cannot rewrite a snapshot.
- Re-fetch (PowerShell):

  ```powershell
  Invoke-WebRequest -UseBasicParsing `
    -Uri 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json' `
    -OutFile 'tests/fixtures/holiday-cn/2026.json'
  ```

## Fields

- `isOffDay: true` = 休（放假）; `isOffDay: false` = 班（调休上班）.
- `name` may cover several festivals, e.g. `国庆节、中秋节` in `2025.json`.
- Unknown extra fields (`$schema`, `$id`, `papers`) are ignored by the validator.

## Why the validator tolerates a one-year spill

Upstream keys a file by the year in the **State Council document's title**, not
by the dates' year, and says so in its own README:

> 年份是按照国务院文件标题年份而不是日期年份，12 月份的日期可能会被下一年的文件影响，因此应检查两个文件。

So a file may carry dates that sit in the neighbouring calendar year, and two
files must be merged to cover one calendar year. Verified against upstream on
2026-09-29: `2019.json` really does contain `2018-12-29`, `2018-12-30` and
`2018-12-31` (the 2019 元旦 arrangement), and `2023.json` contains `2022-12-31`.
`src/core/holiday-overlay.ts` therefore accepts dates within one year of the
declared year in either direction and reports how many entries used the
tolerance (`spill`). The two committed files happen not to spill, so the spill
rule is covered by synthetic payloads in the overlay test.

## Related observation

Upstream `2027.json` was already published but empty on 2026-09-29 — the 2027
arrangement had not been announced yet:

```json
{ "year": 2027, "papers": [], "days": [] }
```

A usable payload with zero entries is therefore a real state, not an error, and
the overlay treats it that way.
