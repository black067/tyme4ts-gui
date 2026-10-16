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
const rustPaths = readFileSync(join(ROOT, 'src-tauri', 'src', 'paths.rs'), 'utf8')

/** 宿主命令的出处。加一个模块就往这里加一行，下面的对账会自动扩到它。 */
const COMMAND_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['update.rs', rustUpdate],
  ['paths.rs', rustPaths]
]

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
    const declaredIn = (source: string): string[] =>
      [...source.matchAll(/#\[tauri::command\][\s\S]{0,160}?\bfn (\w+)\(/g)]
        .map((m) => m[1] ?? '')
        .filter(Boolean)
    const declared = [...new Set(COMMAND_SOURCES.flatMap(([, source]) => declaredIn(source)))]

    for (const command of Object.values(HOST_COMMAND)) {
      expect(declared, `宿主里没有名为 ${command} 的 #[tauri::command]`).toContain(command)
    }
    // 反过来说：Rust 里不该有没被 TS 知道的命令。
    expect(declared.sort(), '命令模块里的命令都应有 TS 侧的对应名').toEqual(
      Object.values(HOST_COMMAND).sort()
    )
    // 反空转：对账真的扫到了两个模块，否则上面两条在只扫到一个文件时空转。
    for (const [name, source] of COMMAND_SOURCES) {
      expect(declaredIn(source).length, `${name} 里应有命令`).toBeGreaterThan(0)
    }
  })

  it('每个命令都真的挂进了 generate_handler!（定义了不等于注册了）', () => {
    // 只在 update.rs 里定义、没列进 lib.rs 的命令，cargo 一声不响，TS 那边 invoke 到的
    // 是 `command not found`——而这一层的失败被 primeUpdaterContext 那样"拿不到就算了"
    // 的写法完全吞掉：界面少一行字，没人会怀疑到注册表上。
    const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    const handlerList = rustLib.match(/generate_handler!\[([\s\S]*?)\]\)/)?.[1] ?? ''
    const registered = [...handlerList.matchAll(/\b(\w+)::(\w+)/g)]
      .map((match) => match[2] ?? '')
      .sort()
    expect(registered, 'lib.rs 的注册表应与 HOST_COMMAND 一一对应').toEqual(
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

  it('install_update 另外收 sha256：复验的基准由 TS 交下去', () => {
    // 换掉正在运行的自己之前，最后那道闸是"落到暂存区的字节还是不是那串摘要"。
    // 基准必须由 TS 提供——Rust 自己不记分，否则判据就搬进了宿主，两侧各判一半。
    expect(rustUpdate).toMatch(/fn install_update\([\s\S]*?sha256: String/)
    const bridge = readFileSync(join(ROOT, 'src', 'backend', 'updater.ts'), 'utf8')
    expect(bridge).toMatch(/HOST_COMMAND\.installUpdate,\s*\{\s*fileName:[\s\S]*?sha256:/)
  })
})

/**
 * 便携版的原地自更新。
 *
 * 这一组断言的形状和其他几条不一样：它防的不是拼写，而是"有人把安装改回成 spawn 新 exe"。
 * 那个写法看起来能跑（下载、校验、启动、退出，一步不缺），实际是必坏——
 * single-instance 的互斥体只按 identifier 命名，旧进程还活着时拉起的新实例会静默退出。
 * 所以这里把三条设计约束钉在源码上，而不只在文档里。
 */
describe('安装是原地替换，不是"起一个新版然后自杀"', () => {
  const rustReplace = readFileSync(join(ROOT, 'src-tauri', 'src', 'replace.rs'), 'utf8')
  const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')

  it('install_update 交给 replace 模块换字节', () => {
    expect(rustUpdate).toMatch(/replace::install_in_place\(/)
    expect(rustReplace).toContain('pub fn install_in_place(')
  })

  it('不残留"直接启动产物"那条死路', () => {
    // 曾经的写法：`std::process::Command::new(&path).spawn()` 然后 `handle.exit(0)`。
    // spawn 本身没错——错的是由"正在退出的一方"来起新版。所以这里要求安装命令里
    // 一次进程创建都没有，起新版的活整个在 replace.rs。
    expect(rustUpdate).not.toMatch(/std::process::Command|Command::new/)
    expect(rustUpdate).toMatch(/fn install_update\([\s\S]*?spawn_blocking/)
  })

  it('等待者等的是进程句柄，不是那把互斥体', () => {
    // 握着互斥体的句柄去"等它释放"是行不通的：命名对象只要还有一个句柄开着就仍然存在，
    // 创建互斥体的调用照样返回"已经存在"，于是新实例还是自己退掉。
    // 所以断言的是等待者实际绑定了哪些 FFI——注释里当然会提到那把锁，代码里不能有。
    const bound = [...rustReplace.matchAll(/extern "system"\s*\{([\s\S]*?)\n\s*\}/g)]
      .map((block) => block[1] ?? '')
      .join('')
    expect(bound).toContain('fn WaitForSingleObject(')
    expect(bound).toContain('fn OpenProcess(')
    expect(bound).not.toMatch(/Mutex/i)
  })

  it('等待者模式在建窗口与注册单实例之前分派', () => {
    const dispatch = rustLib.indexOf('replace::parse_wait_request()')
    const runtime = rustLib.indexOf('ensure_runtime_or_exit()')
    const singleInstance = rustLib.indexOf('tauri_plugin_single_instance::init')
    expect(dispatch).toBeGreaterThan(-1)
    expect(runtime).toBeGreaterThan(-1)
    expect(singleInstance).toBeGreaterThan(-1)
    expect(dispatch, '等待者不该先被 WebView2 检查拦下').toBeLessThan(runtime)
    expect(dispatch, '等待者不该去碰单实例注册').toBeLessThan(singleInstance)
  })

  it('看门狗参数是冻结的跨版本契约', () => {
    // 换完字节之后跑这段代码的是新二进制，而参数是旧版本传出去的：改名字会让
    // "从上一个版本升上来"的那一次退化成固定等三秒。改之前先读 replace.rs 文件头。
    expect(rustReplace).toMatch(/WAIT_FLAG: &str = "--__updater-wait"/)
    expect(rustReplace).toMatch(/UPDATED_FROM_FLAG: &str = "--updated-from"/)
  })

  it('等待者不从命令行接收"可以删的路径"', () => {
    // 只看旗标与 PID：暂存文件由旧进程在换完字节之后自己删。
    // 少一个从命令行取路径去删的原语，就少一个"被旁人拿来删任意文件"的口子。
    expect(rustReplace).not.toMatch(/ASSET_FLAG/)
    expect(rustReplace).toMatch(/\.arg\(PID_FLAG\)/)
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

  it('数据目录的默认位置保持在 %APPDATA%\\万年历', () => {
    // 这是硬性要求：老用户的 settings.json / holidays 缓存原地可用。
    // 用户后来把它搬走了也不影响这一条：搬走的位置记在指针里，启动时由 `paths.rs` 覆盖，
    // 配置里的这个值始终是"没有指针时去哪"。
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

  it('选文件夹的对话框不授予任何路径', () => {
    // 「修改数据目录」要的是系统原生的选夹对话框。它必须是**唯一**一条与文件有关、
    // 却没有 scope 的权限：对话框只是问用户要一个字符串，能读写哪里仍然只由上面那几条
    // `$APPDATA/**` 决定。哪天这条带上了 allow 路径，就说明有人开始用权限指路了。
    const entry = capability.permissions.find(
      (permission) =>
        typeof permission === 'object' && permission.identifier === 'dialog:allow-open'
    )
    expect(typeof entry, 'capabilities/default.json 应有 dialog:allow-open').toBe('object')
    expect((entry as { allow?: unknown[] }).allow, '对话框不该带 scope').toBeUndefined()
  })
})

/**
 * 「换一个数据目录」这条链路的形状。
 *
 * 它依赖一个不太显眼的事实：Tauri 的 `$APPDATA/**` 权限范围**跟着 `appDirectoriesOverride`
 * 走**，所以搬目录不需要放宽任何权限。代价是选中的目录必须专属于本应用——非空的别人目录一旦
 * 被指进来，整个文件夹就都归 webview 读写了。下面这几条钉的就是这两个方向。
 */
describe('数据目录可以搬到别处，权限范围跟着走', () => {
  const dataDirBackend = readFileSync(join(ROOT, 'src', 'backend', 'data-dir.ts'), 'utf8')

  it('指向在任何插件初始化之前改，改的是配置而不是环境变量', () => {
    const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    const apply = rustLib.indexOf('paths::apply_override(')
    expect(apply, '启动时没人应用指针，指针就是写了个寂寞').toBeGreaterThan(-1)
    expect(apply, '晚于 Builder 就没用了：能力清单的 $APPDATA 是照着配置解析的').toBeLessThan(
      rustLib.indexOf('tauri::Builder::default()')
    )
    expect(rustLib).toMatch(/\.run\(context\)/)
  })

  it('指针不写在数据目录里', () => {
    // 它记的内容就是"数据目录在哪"，写在那个目录里就等于把钥匙锁在屋里。
    const anchor = rustPaths.match(/fn anchor_dir[\s\S]*?\n\}/)?.[0] ?? ''
    expect(anchor, '锚点应认得出是配置里的 identifier').toMatch(/config\.identifier/)
    expect(anchor, '锚点若走 app_data_dir，就跟着要被搬走的目录一起搬走了').not.toMatch(
      /app_data_dir/
    )
    expect(rustPaths).toMatch(/const POINTER_FILE: &str = "location\.json"/)
  })

  it('先复制并核对，写了指针之后才删旧目录', () => {
    const body = rustPaths.match(/fn move_data_dir\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(body).not.toBe('')
    const copy = body.indexOf('copy_all(')
    const pointer = body.indexOf('write_pointer(')
    const remove = body.indexOf('remove_moved(')
    expect(copy).toBeGreaterThan(-1)
    expect(pointer, '指针写在复制之后').toBeGreaterThan(copy)
    expect(remove, '删源文件写在指针之后：任何一步失败都只会退化成"两边都有一份"').toBeGreaterThan(
      pointer
    )
  })

  it('能不能当数据目录是 TS 判断的，Rust 只报事实', () => {
    // 这条规则有安全含义，所以它必须写在能被读懂、能被测的地方（backend），而不是藏在
    // 宿主里顺手 return 一个 bool。
    expect(dataDirBackend).toMatch(/facts\.empty \|\| facts\.marker/)
    expect(dataDirBackend).toMatch(/'not-dedicated'/)
    expect(rustPaths.match(/fn facts\([\s\S]*?\n\}/)?.[0] ?? '').not.toMatch(/return Err/)
  })

  it('两条新命令的参数名两侧对得上', async () => {
    for (const command of ['inspectDataDir', 'setDataDir'] as const) {
      expect(rustPaths, `${HOST_COMMAND[command]} 的参数应是 path`).toMatch(
        new RegExp(`fn ${HOST_COMMAND[command]}\\([\\s\\S]*?path: String`)
      )
      expect(dataDirBackend).toMatch(new RegExp(`HOST_COMMAND\\.${command},\\s*\\{\\s*path:`))
    }
  })
})

/**
 * 「启动时不建目录」这一条的形状。
 *
 * 这四条要求里最容易被后来人无意推翻的是它：建目录的代码就在手边，`app_data_dir()` 顺手一调
 * 就会把 `%APPDATA%\万年历` 造出来，而那正是"没有用户目录时先问一句"要拦的事。所以这里不问
 * 行为（行为由 `paths.rs` 那 17 个 Rust 用例管），只钉**源码里不许出现那几个调用形状**。
 */
describe('启动不建用户目录：位置是用户定的', () => {
  const rustSplash = readFileSync(join(ROOT, 'src-tauri', 'src', 'splash.rs'), 'utf8')
  const dataDirBackend = readFileSync(join(ROOT, 'src', 'backend', 'data-dir.ts'), 'utf8')

  it('骨架屏不碰盘；启动时的清扫用的是"不在就算了"那个读法', () => {
    // `app_data_dir()` 本身不建目录，所以允许出现；要拦的是建目录与写文件那两类调用。
    expect(rustSplash).not.toMatch(/create_dir_all|File::create|fs::write/)
    const sweep = rustUpdate.match(/fn sweep_updates_dir[\s\S]*?\n\}/)?.[0] ?? ''
    expect(sweep, '清扫应存在').not.toBe('')
    expect(sweep).toMatch(/existing_updates_dir/)
    // 建目录的那一份只跟着"用户按了下载"。
    expect(rustUpdate.match(/fn existing_updates_dir[\s\S]*?\n\}/)?.[0]).not.toMatch(
      /create_dir_all/
    )
    expect(rustUpdate.match(/fn updates_dir[\s\S]*?\n\}/)?.[0]).toMatch(/create_dir_all/)
  })

  it('只有选定位置那一条链路会建目录：启动路径上一个 create_dir_all 都没有', () => {
    // 建目录的代码就在手边，`app_data_dir()` 顺手一调就把 %APPDATA%\万年历 造出来了——
    // 而那正是"没有用户目录时先问一句"要拦的事。行为由 `paths.rs` 的用例管，这里只钉形状。
    for (const name of [
      'apply_override',
      'apply_override_at',
      'locations',
      'recorded_pointer',
      'default_data_dir',
      'anchor_dir',
      'read_pointer',
      'only_data_changed',
      'setup_plan',
      'adopt'
    ]) {
      const body = rustPaths.match(new RegExp(`fn ${name}\\([\\s\\S]*?\\n\\}`))?.[0]
      expect(body, `paths.rs 里找不到 ${name}`).not.toBeUndefined()
      expect(body, `${name} 不该在盘上建出目录`).not.toMatch(/create_dir_all/)
    }
    // 唯一的例外是指针自己：那个锚点目录不是用户数据。
    expect(rustPaths.match(/fn write_pointer[\s\S]*?\n\}/)?.[0]).toMatch(/create_dir_all/)
    expect(rustPaths.match(/fn choose_data_dir_at[\s\S]*?\n\}/)?.[0]).toMatch(/create_dir_all/)
  })

  it('apply_override 在 Builder 之前，且把结果交出去而不只是改配置', () => {
    const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    const apply = rustLib.indexOf('paths::apply_override(')
    expect(apply, '没人应用指针，指针就是写了个寂寞').toBeGreaterThan(-1)
    expect(apply, '晚于 Builder 就没用了').toBeLessThan(
      rustLib.indexOf('tauri::Builder::default()')
    )
    expect(rustLib).toMatch(/handle\.manage\(startup\)/)
    expect(rustPaths).toMatch(/pub fn apply_override\(config: &mut Config\) -> StartupPlan/)
  })

  it('要用户选位置时不跑清扫：那棵树还没被认下来', () => {
    const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    // 扫 `updates` 顺路就会把"目录不存在"变成"目录被建出来"，正是这一屏要拦的事。
    const guard = rustLib.match(/if !choosing \{[\s\S]*?\n\s{12}\}/)?.[0] ?? ''
    expect(guard, '选位置那一屏不该有任何后台写盘').not.toBe('')
    expect(guard).toMatch(/cleanup_exe_dir/)
    expect(guard).toMatch(/sweep_updates_dir/)
  })

  it('选位置那一屏由同一个 main 窗口承载，窗口清单不变', () => {
    expect(capability.windows).toEqual(['main'])
    const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    expect(rustLib).toMatch(/if choosing \{[\s\S]*?SETUP_WINDOW/)
    expect(rustSplash).toMatch(/setup: bool|first_run: bool/)
  })

  it('四条新命令都注册了，参数名两侧一致', () => {
    const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    const handlerList = rustLib.match(/generate_handler!\[([\s\S]*?)\]\)/)?.[1] ?? ''
    for (const command of ['setup_plan', 'choose_data_dir', 'delete_data_dir', 'relaunch']) {
      expect(handlerList, `${command} 定义了但没注册`).toContain(`paths::${command}`)
    }
    expect(rustPaths).toMatch(/fn choose_data_dir\(app: AppHandle, path: String\)/)
    expect(dataDirBackend).toMatch(/HOST_COMMAND\.chooseDataDir,\s*\{\s*path:/)
    expect(dataDirBackend).toMatch(/HOST_COMMAND\.deleteDataDir/)
    expect(dataDirBackend).toMatch(/HOST_COMMAND\.relaunch/)
  })

  it('删除走回收站，不是就地删掉', () => {
    const rustRecycle = readFileSync(join(ROOT, 'src-tauri', 'src', 'recycle.rs'), 'utf8')
    expect(rustRecycle).toMatch(/FOF_ALLOWUNDO/)
    const body = rustPaths.match(/fn delete_data_dir_at\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(body, '找不到 delete_data_dir_at').not.toBe('')
    expect(body).toMatch(/recycle::to_bin/)
    // 就地删掉的那条路一次都不许出现：用户点的是"删掉"，不是"永久销毁"。
    expect(body).not.toMatch(/remove_dir_all|File::delete/)
  })

  it('重启用的是那个隐藏等待者，不是 process::restart', () => {
    const rustReplace = readFileSync(join(ROOT, 'src-tauri', 'src', 'replace.rs'), 'utf8')
    const rustLib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    expect(rustReplace).toMatch(/pub fn relaunch/)
    expect(rustReplace).toMatch(/spawn_wait/)
    expect(`${rustLib}\n${rustPaths}`).not.toMatch(/process::restart/)
  })

  it('渲染层按骨架屏那颗标记分叉，选位置那一屏只装桥', () => {
    const mainTsx = readFileSync(join(ROOT, 'src', 'renderer', 'src', 'main.tsx'), 'utf8')
    const index = readFileSync(join(ROOT, 'src', 'backend', 'index.ts'), 'utf8')
    expect(mainTsx).toMatch(/__TAYME_SPLASH__\?\.setup/)
    expect(mainTsx).toMatch(/startSetupBackend\(\)/)
    const setup = index.match(/export async function startSetupBackend\(\)[\s\S]*?\n\}/)?.[0] ?? ''
    expect(setup, 'backend/index.ts 应有 startSetupBackend').not.toBe('')
    // 那一句"不读设置、不排定时器"是这一屏的全部纪律，只能这样钉住。
    expect(setup).not.toMatch(/setInterval|loadSettings|startBackend\(\)/)
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
