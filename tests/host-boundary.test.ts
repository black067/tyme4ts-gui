/**
 * 边界契约测试。
 *
 * 取代 Electron 时代的 `tests/packaging-contract.test.ts`。那份测试守的风险形状是
 * "electron-builder 不把 node_modules 打进包，所以主进程万一 import 了 `dependencies`
 * 里的东西，开发时一切正常、发布出去就起不来"。架构换成 Tauri 之后，那个具体形状消失了
 * （只有一个 Vite bundle，依赖全被打进去），但同一类风险换了形状，仍然只会在用户机上暴露：
 *
 * 1. **分层**。`src/backend` 是仓库里唯一允许知道 Tauri 存在的地方。core / shared / renderer
 *    一旦被塞进 `@tauri-apps/*` 或 `node:*`，代价是"这条 import 在 webview 里解析不了"，
 *    而这在 `npm run dev:web` 与 `npm test` 里都看不出来。
 * 2. **跨语言的名字**。命令名、事件名、命令参数名在 TS 里是 `fileName`、在 Rust 里是
 *    `file_name`，对不上的表现是 invoke 直接失败——类型检查两边都够不着对方。
 * 3. **配置里的安全面**。能力文件的 scope 决定前端能读写哪些路径、能连哪些域名；
 *    数据目录决定用户设置落在哪儿。这几条写错不会立刻坏，会在某个用户机上坏。
 * 4. **构建产物**。产物名要与 `src/core/update.ts` 匹配发布资产的正则同源；打出来的 JS
 *    不该留有运行时的 `require()`（那是"某个依赖没被打进 bundle"的指纹）。
 *
 * 与那份旧测试同样的原则：断言要能真的失败，所以每条扫描都配一条反空转守卫。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PORTABLE_ASSET_PATTERN } from '@core'
import { HOST_COMMAND, HOST_EVENT } from '@shared/ipc'
import { splashBackground } from '@shared/splash'

const ROOT = process.cwd()

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  productName: string
  version: string
}

const tauriConfig = JSON.parse(
  readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')
) as {
  productName: string
  identifier: string
  version: string
  build: {
    devUrl: string
    frontendDist: string
    beforeDevCommand: string
    beforeBuildCommand: string
  }
  app: {
    windows: Array<{
      label: string
      create: boolean
      visible: boolean
      title: string
      width: number
      height: number
      minWidth: number
      minHeight: number
      backgroundColor: [number, number, number, number]
      theme: string
    }>
    security: { csp: string | null }
    appDirectoriesOverride: Record<string, string>
  }
  bundle: { active: boolean; icon: string[] }
}

const capability = JSON.parse(
  readFileSync(join(ROOT, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
) as {
  identifier: string
  windows: string[]
  permissions: Array<string | { identifier: string; allow?: Array<Record<string, string>> }>
}

const rustUpdate = readFileSync(join(ROOT, 'src-tauri', 'src', 'update.rs'), 'utf8')

/** 某个源目录下的全部 `.ts` / `.tsx` 文件。 */
function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
}

function shortPath(absolute: string): string {
  return relative(ROOT, absolute).split(sep).join('/')
}

const backendSources = sources('src/backend')
const coreSources = sources('src/core')
const sharedSources = sources('src/shared')
const rendererSources = sources('src/renderer')

/** 源码里出现的裸模块名（含 `import type`、动态 import、`require`）。 */
function bareSpecifiers(source: string): string[] {
  const found = new Set<string>()
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('node:')) continue
      found.add(specifier)
    }
  }
  return [...found]
}

function specifiersIn(files: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const file of files) {
    for (const specifier of bareSpecifiers(readFileSync(file, 'utf8'))) {
      out.set(specifier, [...(out.get(specifier) ?? []), shortPath(file)])
    }
  }
  return out
}

describe('只有 src/backend 知道 Tauri 的存在', () => {
  const HOST_IMPORTER = join(ROOT, 'src', 'backend', 'host.ts')

  it('core / shared / renderer 里没有 @tauri-apps 与 node: 依赖', () => {
    const offenders: string[] = []
    for (const [specifier, files] of specifiersIn([
      ...coreSources,
      ...sharedSources,
      ...rendererSources
    ])) {
      if (specifier.startsWith('@tauri-apps/') || specifier === 'electron') {
        offenders.push(`${files.join(', ')} → '${specifier}'`)
      }
    }
    expect(offenders, '这三层必须与宿主无关').toEqual([])

    // `node:` 前缀不出现在裸名里，单独扫文本：webview 里没有 Node 模块可解析。
    const nodeImports = [...coreSources, ...sharedSources, ...rendererSources]
      .filter((file) => /['"]node:[^'"]+['"]/.test(readFileSync(file, 'utf8')))
      .map(shortPath)
    expect(nodeImports, 'webview 侧的层不得 import node:*').toEqual([])
  })

  it('backend 里也只有 host.ts 直接 import @tauri-apps/*', () => {
    const offenders: string[] = []
    for (const file of backendSources) {
      if (file === HOST_IMPORTER) continue
      for (const specifier of bareSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('@tauri-apps/'))
          offenders.push(`${shortPath(file)} → '${specifier}'`)
      }
    }
    expect(offenders, 'Tauri API 的调用点只应有 host.ts 一个文件').toEqual([])
  })

  it('扫描真的覆盖到了这几层（反空转守卫）', () => {
    expect(backendSources.length).toBeGreaterThanOrEqual(6)
    expect(coreSources.length).toBeGreaterThan(0)
    expect(sharedSources.some((file) => file.endsWith('ipc.ts'))).toBe(true)
    expect(rendererSources.length).toBeGreaterThan(20)
    expect(
      bareSpecifiers(readFileSync(HOST_IMPORTER, 'utf8')).some((s) => s.startsWith('@tauri-apps/'))
    ).toBe(true)
  })

  it('认得出它声称认得的 import 写法', () => {
    expect(bareSpecifiers("import { x } from '@tauri-apps/api/core'")).toEqual([
      '@tauri-apps/api/core'
    ])
    expect(bareSpecifiers("import type { T } from '@shared/ipc'")).toEqual(['@shared/ipc'])
    expect(bareSpecifiers("await import('@tauri-apps/plugin-fs')")).toEqual([
      '@tauri-apps/plugin-fs'
    ])
    expect(bareSpecifiers("import { readFileSync } from 'node:fs'")).toEqual([])
    expect(bareSpecifiers("import './styles/global.css'")).toEqual([])
  })

  it('旧的 Electron 目录与配置确实不在了', () => {
    for (const gone of [
      'src/main',
      'src/preload',
      'electron.vite.config.ts',
      'electron-builder.yml'
    ]) {
      expect(existsSync(join(ROOT, gone)), `${gone} 应随 Electron 一起删掉`).toBe(false)
    }
    const deps = {
      ...((
        JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }
      ).dependencies ?? {}),
      ...((
        JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
          devDependencies?: Record<string, string>
        }
      ).devDependencies ?? {})
    }
    expect(Object.keys(deps).filter((name) => name.includes('electron'))).toEqual([])
  })
})

/**
 * TS 与 Rust 之间的名字。
 *
 * 参数名这一条尤其值得钉：Tauri 把 JS 的 camelCase 映射到 Rust 的 snakeCase，
 * 拼错任何一边都是运行时才响的 `invalid args`，而 typecheck 看不见对面的世界。
 */
describe('命令名与事件名在两侧一致', () => {
  it('HOST_COMMAND 的每个值都是 Rust 里的一个 #[tauri::command]', () => {
    for (const command of Object.values(HOST_COMMAND)) {
      const pattern = new RegExp(`async fn ${command}\\(|fn ${command}\\(`)
      expect(rustUpdate, `update.rs 缺少命令 ${command}`).toMatch(pattern)
    }
    // 反过来说：Rust 里不该有没被 TS 知道的命令。
    const declared = [
      ...new Set(
        [...rustUpdate.matchAll(/#\[tauri::command\][\s\S]{0,120}?\bfn (\w+)\(/g)]
          .map((m) => m[1] ?? '')
          .filter(Boolean)
      )
    ].sort()
    expect(declared, 'update.rs 里的命令都应有 TS 侧的对应名').toEqual(
      Object.values(HOST_COMMAND).sort()
    )
  })

  it('HOST_EVENT 的名字与 Rust 发的那个字符串相同', () => {
    expect(rustUpdate).toMatch(
      new RegExp(`PROGRESS_EVENT: &str = "${HOST_EVENT.downloadProgress}"`)
    )
  })

  it('download_update 的参数名两侧对得上（camelCase ↔ snake_case）', () => {
    const signature = rustUpdate.match(/pub async fn download_update\([\s\S]*?\) ->/)?.[0] ?? ''
    expect(signature).toContain('url: String')
    expect(signature).toContain('file_name: String')

    const bridge = readFileSync(join(ROOT, 'src', 'backend', 'updater.ts'), 'utf8')
    expect(bridge).toMatch(/HOST_COMMAND\.downloadUpdate,\s*\{\s*url:[\s\S]*?fileName:/)
  })

  it('delete_update / install_update 都收 fileName', () => {
    const bridge = readFileSync(join(ROOT, 'src', 'backend', 'updater.ts'), 'utf8')
    for (const command of ['deleteUpdate', 'installUpdate'] as const) {
      const rustName = HOST_COMMAND[command]
      expect(rustUpdate, `${rustName} 的参数应是 file_name`).toMatch(
        new RegExp(`fn ${rustName}\\([\\s\\S]*?file_name: String`)
      )
      expect(bridge, `TS 侧调 ${command} 时应传 fileName`).toMatch(
        new RegExp(`HOST_COMMAND\\.${command},\\s*\\{\\s*fileName:`)
      )
    }
  })
})

describe('tauri.conf.json 守住了首帧与数据位置', () => {
  const main = tauriConfig.app.windows[0]

  it('窗口由 Rust 现建，且初始不可见（骨架屏的前提）', () => {
    expect(main?.label).toBe('main')
    expect(main?.create).toBe(false)
    expect(main?.visible).toBe(false)
  })

  it('窗口底色 = 默认主题浅色的 --color-bg', () => {
    // 与 splash.rs 那份是同一套规则的两个出口：配置文件给"没读到设置时"的值。
    expect(main?.backgroundColor).toEqual(hexToRgba(splashBackground('minimal', false)))
  })

  it('窗口尺寸与旧 Electron 的一致（用户不该感到换了个应用）', () => {
    expect([main?.width, main?.height, main?.minWidth, main?.minHeight]).toEqual([
      1240, 860, 960, 640
    ])
    expect(main?.title).toBe(manifest.productName)
  })

  it('版本与产品名都取自 package.json，不留第二个真相', () => {
    expect(tauriConfig.version).toBe('../package.json')
    expect(tauriConfig.productName).toBe(manifest.productName)
    // 不以 .app 结尾：`tauri build` 会警告它与 macOS 的应用包扩展名冲突。
    expect(tauriConfig.identifier).toBe('com.tyme.desktop')
    expect(tauriConfig.identifier.endsWith('.app')).toBe(false)
  })

  it('前后端接头的路径与脚本对得上', () => {
    expect(tauriConfig.build.frontendDist).toBe('../dist')
    expect(tauriConfig.build.devUrl).toBe('http://localhost:5173')
    // vite.config.ts 里的 strictPort 必须与 devUrl 的端口是同一个数。
    const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
    expect(vite).toMatch(/port:\s*5173/)
    expect(vite).toMatch(/strictPort:\s*true/)
    expect(tauriConfig.build.beforeDevCommand).toBe('npm run dev:web')
    expect(tauriConfig.build.beforeBuildCommand).toBe('npm run build')
  })

  it('数据目录保持在 %APPDATA%\\万年历', () => {
    // 这是硬性要求：老用户的 settings.json / holidays 缓存原地可用。
    expect(tauriConfig.app.appDirectoriesOverride?.data).toBe('$DATA/万年历')
  })

  it('CSP 交给 index.html 里那条 meta，配置不再注入一份', () => {
    // Tauri 会原样转发页面的 meta；配置里再写一份就是两个真相，会互相盖。
    expect(tauriConfig.app.security.csp).toBeNull()
    const html = readFileSync(join(ROOT, 'src', 'renderer', 'index.html'), 'utf8')
    expect(html).toMatch(/<meta\s+http-equiv="Content-Security-Policy"/)
  })

  it('不出安装包：只发裸 exe', () => {
    expect(tauriConfig.bundle.active).toBe(false)
    expect(tauriConfig.bundle.icon.length).toBeGreaterThan(0)
  })

  function hexToRgba(hex: string): [number, number, number, number] {
    const at = (index: number): number => Number.parseInt(hex.slice(index, index + 2), 16)
    return [at(1), at(3), at(5), 255]
  }
})

describe('能力文件把口子收在应用数据目录与三个域名', () => {
  /** 按 identifier 取一条权限（对象写法的那类）。 */
  function scoped(identifier: string) {
    const entry = capability.permissions.find(
      (permission) => typeof permission === 'object' && permission.identifier === identifier
    )
    expect(entry, `capabilities/default.json 应有 ${identifier}`).not.toBe('string')
    return (entry as { allow?: Array<Record<string, string>> }).allow ?? []
  }

  it('只给那个叫 main 的窗口', () => {
    expect(capability.windows).toEqual(['main'])
  })

  it('文件访问限定在 $APPDATA 之下，且用 path 而非 entry', () => {
    // 历史 bug 形状：scope 写成 `entry` 会静默不生效，表现为"能读设置但存不下"。
    const commands = [
      'fs:allow-exists',
      'fs:allow-mkdir',
      'fs:allow-read-text-file',
      'fs:allow-write-text-file',
      'fs:allow-rename'
    ]
    for (const command of commands) {
      const allow = scoped(command)
      expect(allow.length, `${command} 需要一条 scope`).toBeGreaterThan(0)
      for (const rule of allow) {
        expect(Object.keys(rule), `${command} 的 scope 只能用 path`).toEqual(['path'])
        expect(rule.path, `${command} 只许碰自己的数据目录`).toBe('$APPDATA/**')
      }
    }
  })

  it('网络只放行 api.github.com 与两个 CDN', () => {
    expect(
      scoped('http:default')
        .map((rule) => rule.url)
        .sort()
    ).toEqual(['https://api.github.com/**', 'https://cdn.jsdelivr.net/**', 'https://unpkg.com/**'])
  })

  it('外链交给系统浏览器，但只允许 https', () => {
    // `openExternal` 在 TS 侧也判过一次（src/backend/host.ts）。这里是第二道：
    // 前者是"我们不该递出去"，后者是"就算递出去了也开不了别的协议"。
    expect(
      scoped('opener:allow-open-url')
        .map((rule) => rule.url)
        .sort()
    ).toEqual(['https://**'])
  })

  it('自定义命令不需要也不能出现在能力里', () => {
    // `invoke_handler` 注册的命令不受 ACL 管制；若有人开始为 download_update 写权限条目，
    // 那说明有人误以为插件权限也适用于它们——白写一条，还容易漏掉真正该管的。
    const serialized = JSON.stringify(capability.permissions)
    for (const command of Object.values(HOST_COMMAND)) {
      expect(serialized).not.toContain(command)
    }
  })

  it('主题命令单独放行，其余窗口能力走 core:default', () => {
    expect(capability.permissions).toContain('core:default')
    expect(capability.permissions).toContain('core:window:allow-set-theme')
  })
})

describe('产物名与更新器的匹配规则同源', () => {
  it('scripts/package.mjs 的模板产出的名字过 PORTABLE_ASSET_PATTERN', () => {
    // 旧版这条来自 electron-builder.yml 的 portable.artifactName；现在唯一真相在打包脚本里。
    const script = readFileSync(join(ROOT, 'scripts', 'package.mjs'), 'utf8')
    expect(script).toContain("const ARTIFACT_BASE_NAME = 'chinese-calendar'")
    const name = `chinese-calendar-${manifest.version}-portable.exe`
    expect(PORTABLE_ASSET_PATTERN.test(name)).toBe(true)
    expect(PORTABLE_ASSET_PATTERN.exec(name)?.[1]).toBe(manifest.version)
  })

  it('产物名是 ASCII：GitHub Releases 会丢弃含 CJK 的文件名', () => {
    expect(/^[\x20-\x7e]+$/.test(`chinese-calendar-${manifest.version}-portable.exe`)).toBe(true)
  })
})

describe('打出来的 bundle 不留运行时外部依赖', () => {
  const BUNDLE_GLOB = join(ROOT, 'dist', 'assets')

  /**
   * 缺产物就自己构建一次。
   *
   * 与旧版同样的理由：断言"dist 里不该有什么"时，如果 dist 是否存在取决于谁先跑过什么，
   * 这个测试在干净检出上就是空转。
   */
  let built = false
  function ensureBuilt(): void {
    if (built) return
    if (!existsSync(BUNDLE_GLOB)) {
      // 不走 `npx` + shell：Windows 上 npx 是 .cmd，非得 shell:true 不可，而那正好触发
      // Node 的 DEP0190（参数只被拼接不被转义）。拿当前这个 node 直接跑依赖里的 vite 入口，
      // 跨平台、无 shell，也不依赖 PATH 上有没有 npx。
      execFileSync(
        process.execPath,
        [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
        {
          cwd: ROOT,
          stdio: 'pipe'
        }
      )
    }
    built = true
  }

  const BUILD_TIMEOUT_MS = 180_000

  it(
    'dist/ 里有 JS bundle 可查',
    () => {
      ensureBuilt()
      expect(existsSync(BUNDLE_GLOB), 'vite build 没有产出 dist/assets').toBe(true)
      expect(
        readdirSync(BUNDLE_GLOB).filter((name) => name.endsWith('.js')).length
      ).toBeGreaterThan(0)
    },
    BUILD_TIMEOUT_MS
  )

  it(
    'bundle 里没有 require( 与 node: 内建模块',
    () => {
      ensureBuilt()
      const offenders: string[] = []
      for (const name of readdirSync(BUNDLE_GLOB)) {
        if (!name.endsWith('.js')) continue
        const code = readFileSync(join(BUNDLE_GLOB, name), 'utf8')
        for (const match of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)) {
          offenders.push(`${name} → require('${match[1]}')`)
        }
        // 只认"被引号包住的路径"：压缩后的代码里有 `{node:n,offset:…}` 这种对象属性，
        // 裸匹配 `node:` 会把 React 的内部代码当成违规。
        for (const match of code.matchAll(/['"]node:[^'"]+['"]/g)) {
          offenders.push(`${name} → ${match[0]}`)
        }
      }
      // Vite 会把依赖都打进来；出现裸 require 说明某个 import 被当成外部模块放过了。
      expect(offenders).toEqual([])
    },
    BUILD_TIMEOUT_MS
  )

  it('认得出它声称认得的写法', () => {
    expect(/\brequire\s*\(\s*['"]([^'"]+)['"]/g.test("const a=require('tyme4ts')")).toBe(true)
    expect(/['"]node:[^'"]+['"]/.test("import x from 'node:fs'")).toBe(true)
    // 也认得出不该报的：对象属性里的 `node:` 不是模块路径。
    expect(/['"]node:[^'"]+['"]/.test('return {node:n,offset:t-e}')).toBe(false)
  })
})
