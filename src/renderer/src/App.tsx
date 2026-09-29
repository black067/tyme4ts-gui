import { useEffect, useState, type ReactElement } from 'react'
import type { AppInfo, AppSettings } from '@shared/ipc'
import { formatSolarDate, todayKey } from '@core'

/**
 * Phase 0 shell: proves the preload bridge, settings persistence and the core
 * engine all work end to end. Replaced by the view router in Phase 1.
 */
export function App(): ReactElement {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([window.tyme.app.getInfo(), window.tyme.settings.get()])
      .then(([nextInfo, nextSettings]) => {
        if (cancelled) return
        setInfo(nextInfo)
        setSettings(nextSettings)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const today = todayKey()

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">万年历</h1>
        <p className="app-subtitle">{formatSolarDate(today)}</p>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2 className="panel-title">运行环境</h2>
          {error ? <p className="panel-error">{error}</p> : null}
          <dl className="kv">
            <div className="kv-row">
              <dt>应用版本</dt>
              <dd>{info?.version ?? '…'}</dd>
            </div>
            <div className="kv-row">
              <dt>Electron</dt>
              <dd>{info?.electron ?? '…'}</dd>
            </div>
            <div className="kv-row">
              <dt>Chromium</dt>
              <dd>{info?.chrome ?? '…'}</dd>
            </div>
            <div className="kv-row">
              <dt>Node.js</dt>
              <dd>{info?.node ?? '…'}</dd>
            </div>
            <div className="kv-row">
              <dt>数据目录</dt>
              <dd>{info?.userDataPath ?? '…'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2 className="panel-title">已加载设置</h2>
          <pre className="code-block">{settings ? JSON.stringify(settings, null, 2) : '…'}</pre>
        </section>
      </main>
    </div>
  )
}
