import { useEffect, useState, type ReactElement } from 'react'
import type { SetupPlanView } from '@shared/data-dir'
import { useMessages } from '@renderer/i18n'
import { rejectText } from '../settings/data-dir-text'
import './setup.css'

/** 三个可选项。前两项的路径由宿主算出来，第三项由用户自己填。 */
type Choice = 'user' | 'exe' | 'custom'

/** 屏幕上那句话，以及它是"你选的不行"还是"这次没成"。 */
interface Note {
  text: string
  tone: 'error' | 'note'
}

/** 选项的顺序也是默认顺序：先本机用户目录，再程序旁边，最后才让人自己填。 */
const FIRST_CHOICE: readonly Choice[] = ['user', 'exe', 'custom']

/**
 * 这一项按得动吗。
 *
 * 只有宿主答过"写不进去"的那两项有答案。自定义那一栏在真的去 inspect 之前谁也不知道行不行，
 * 所以它一律算按得动——把它一起拦下来，等于拦掉用户唯一还能自己试的那条路。
 */
function isUsable(plan: SetupPlanView, choice: Choice): boolean {
  if (choice === 'custom') return true
  const candidate = choice === 'user' ? plan.user : plan.exe
  return candidate !== null && candidate.writable
}

/**
 * 首启那一屏：盘上还没有用户目录，先请用户挑一个位置。
 *
 * 三件事决定它长什么样，而它们都不是审美：
 *
 * 1. **路径看得见。** 前两个选项下面直接印完整路径。"用户目录"是个抽象说法，
 *    `C:\Users\…\AppData\Roaming\万年历` 才是他以后要去翻的东西。
 * 2. **这一屏不写盘。** 装配走的是 `startSetupBackend()`：不读设置、不排定时器、不碰缓存，
 *    因为那些动作每一件都会把"目录还不存在"变成"目录被建出来了"。
 * 3. **按完就重启。** 指向只能在进程开始之前定下来（`src-tauri/src/paths.rs` 头部记着原因），
 *    所以确定之后界面停在"正在准备…"，等整个程序重开一次。
 */
export function SetupView(): ReactElement {
  const t = useMessages()
  const [plan, setPlan] = useState<SetupPlanView | null>(null)
  const [choice, setChoice] = useState<Choice>('user')
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState<Note | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    // 原生标题栏跟着这里走（`src-tauri/src/lib.rs` 的 on_document_title_changed），
    // 所以这一屏也得改：窗口标签还是 main，看得见的那一行该说清他在决定什么。
    document.title = `${t.app.title} · ${t.setup.title}`
  }, [t])

  useEffect(() => {
    let cancelled = false
    window.tyme.dataDir
      .plan()
      .then((next) => {
        if (cancelled) return
        setPlan(next)
        if (next.recorded !== null) {
          // 指针记着的位置不在盘上了（U 盘被拔走）。把那个路径原样填进自定义那一栏：
          // 用户多半只是想把盘插回来，而不是重新挑一个地方。
          setCustom(next.recorded)
          setChoice('custom')
          return
        }
        // 默认落在**按得动**的那一项上。把确定按钮摆在一个灰掉了的位置旁边不算帮忙：那一次
        // 点击要么注定失败，要么根本按不下去，而这两样都能在拿到答复的那一瞬就避免。
        const usable = FIRST_CHOICE.find((id) => isUsable(next, id))
        if (usable !== undefined) setChoice(usable)
      })
      .catch(() => {
        if (!cancelled) setNote({ text: t.setup.loadFailed, tone: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const selected = pathOf(plan, choice, custom)
  // 空着不让人按。确定之后要么建好目录、要么回来一句理由，而"什么都没填"两样都不该发生。
  const canConfirm = plan !== null && !pending && selected !== ''

  const browse = (): void => {
    setNote(null)
    void window.tyme.dataDir
      .pick()
      .then((picked) => {
        // 取消就原样留着：那不是一次失败，界面连一句提示都不该有。
        if (picked === null) return
        setCustom(picked)
        setChoice('custom')
      })
      .catch(() => undefined)
  }

  /**
   * 重启没成——或者这是调试版，按规矩不自动重启。
   *
   * 两种情况对用户是同一件事：位置已经记下来了，自己重开一次就生效。所以这一句留在屏幕上
   * 让人读完，而不是闪一下就没；它也不是错误语气，界面据此用 `note` 而不是 `error`。
   */
  const waitManualRestart = (): void => {
    setPending(false)
    setNote({ text: t.dataDir.restartLater, tone: 'note' })
  }

  const confirm = (): void => {
    if (!canConfirm) return
    setNote(null)
    setPending(true)
    void window.tyme.dataDir
      .choose(selected)
      .then((outcome) => {
        if (outcome.kind === 'chosen') {
          // 目录建好了、标记写下了、指针记下了。剩下的只有一件事：让指向生效。
          void window.tyme.dataDir
            .relaunch()
            .then((restart) => {
              if (restart.kind !== 'restarting') waitManualRestart()
            })
            .catch(waitManualRestart)
          return
        }
        setPending(false)
        setNote({
          text:
            outcome.kind === 'rejected' ? rejectText(t, outcome.reason) : t.dataDir.chooseFailed,
          tone: 'error'
        })
      })
      .catch(() => {
        setPending(false)
        setNote({ text: t.dataDir.chooseFailed, tone: 'error' })
      })
  }

  return (
    <div className="setup">
      <h1 className="setup__title">{t.setup.title}</h1>
      <p className="setup__intro">{t.setup.intro}</p>

      {plan?.reason === 'recorded-missing' && plan.recorded !== null ? (
        <p className="setup__recorded">
          {t.setup.recordedMissing}
          <code className="setup__path">{plan.recorded}</code>
        </p>
      ) : null}

      <fieldset className="setup__options" disabled={pending}>
        <legend className="visually-hidden">{t.setup.title}</legend>
        <Option
          label={t.setup.userDir}
          candidate={plan === null ? null : plan.user}
          checked={choice === 'user'}
          onSelect={() => setChoice('user')}
        />
        {plan?.exe ? (
          <Option
            label={t.setup.exeDir}
            candidate={plan.exe}
            checked={choice === 'exe'}
            onSelect={() => setChoice('exe')}
          />
        ) : null}

        <div className={`setup__option${choice === 'custom' ? ' setup__option--on' : ''}`}>
          <label className="setup__option-head">
            <input
              type="radio"
              name="location"
              checked={choice === 'custom'}
              onChange={() => setChoice('custom')}
            />
            <span className="setup__option-label">{t.setup.custom}</span>
          </label>
          <div className="setup__custom">
            <input
              className="setup__input"
              type="text"
              value={custom}
              placeholder={t.setup.customPlaceholder}
              spellCheck={false}
              aria-label={t.setup.custom}
              onChange={(event) => {
                setCustom(event.target.value)
                setChoice('custom')
                setNote(null)
              }}
              onFocus={() => setChoice('custom')}
            />
            <button type="button" className="text-button" onClick={browse} disabled={pending}>
              {t.setup.browse}
            </button>
          </div>
        </div>
      </fieldset>

      {note ? (
        <p className={note.tone === 'error' ? 'setup__error tool__error' : 'setup__note'}>
          {note.text}
        </p>
      ) : null}

      <div className="setup__actions">
        <button
          type="button"
          className="primary-button"
          onClick={confirm}
          disabled={!canConfirm}
          aria-busy={pending}
        >
          {pending ? t.setup.preparing : t.setup.confirm}
        </button>
      </div>
    </div>
  )
}

/**
 * 一个固定位置。
 *
 * 写不进去的那一项是**禁用**而不是"按下去再告诉你不行"：`Z:` 已经不在了，任何一次点击都
 * 注定失败，而禁用之后旁边还留着"不能写"那个小标记，理由没有藏起来。
 */
function Option({
  label,
  candidate,
  checked,
  onSelect
}: {
  label: string
  candidate: SetupPlanView['user'] | null
  checked: boolean
  onSelect: () => void
}): ReactElement {
  const t = useMessages()
  return (
    <div className={`setup__option${checked ? ' setup__option--on' : ''}`}>
      <label className="setup__option-head">
        <input
          type="radio"
          name="location"
          checked={checked}
          disabled={candidate === null || !candidate.writable}
          onChange={onSelect}
        />
        <span className="setup__option-label">{label}</span>
        {candidate?.exists ? <span className="setup__tag">{t.setup.hasData}</span> : null}
        {candidate !== null && !candidate.writable ? (
          <span className="setup__tag setup__tag--off">{t.setup.unwritable}</span>
        ) : null}
      </label>
      <code className="setup__path">{candidate?.path ?? ''}</code>
    </div>
  )
}

/** 这一项最终落到盘上的那个路径。没得落时是空串——确定按钮据此保持灰着。 */
function pathOf(plan: SetupPlanView | null, choice: Choice, custom: string): string {
  if (plan === null) return ''
  if (choice === 'custom') return custom.trim()
  if (!isUsable(plan, choice)) return ''
  const candidate = choice === 'user' ? plan.user : plan.exe
  return candidate === null ? '' : candidate.path
}
