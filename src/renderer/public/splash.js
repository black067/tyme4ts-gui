/**
 * 首帧引导脚本：经典脚本，先于任何 module 同步执行。
 *
 * 把宿主算好的设置写进 `<html>`（data-theme / data-locale / data-first），骨架屏于是
 * 从第一帧起就是用户真正的主题、语言与首启文案。任何一步失败都保持 index.html 里的
 * 静态默认值——最坏情况是骨架屏用 zh-Hans + minimal-light，绝不会白屏。
 *
 * 输入有两个来源，按优先级：
 *
 * 1. `window.__TAYME_SPLASH__`——宿主（`src-tauri/src/splash.rs`）在本脚本之前执行的初始化
 *    脚本里放的对象。开发与生产都走这条，因为它与页面 URL 无关。
 * 2. 查询串——旧版靠主进程往 loadURL 拼 `?dt=&locale=&first=`。现在没人这么做了，但
 *    直接用浏览器跑 `npm run dev:web` 时手工拼串仍然有效，留着这条回退不要钱。
 *
 * 这是本页唯一非 module 脚本，由 tests/splash-contract.test.ts 钉住；
 * 它的存在前提是 CSP `script-src 'self'`，收紧 CSP 时先看这条测试。
 */

const ATTRIBUTE_VALUE = /^[A-Za-z0-9._-]+$/

function applyAttribute(name, value) {
  if (typeof value === 'string' && ATTRIBUTE_VALUE.test(value)) {
    document.documentElement.setAttribute(name, value)
  }
}

function fromQuery() {
  const query = new URLSearchParams(window.location.search)
  return {
    dt: query.get('dt'),
    locale: query.get('locale'),
    // 查询串里是字符串，初始化脚本里是布尔：两种写法都认。
    first: query.get('first') === '1',
    setup: query.get('setup') === '1'
  }
}

try {
  const injected = window.__TAYME_SPLASH__
  const fallback = fromQuery()
  applyAttribute('data-theme', injected?.dt ?? fallback.dt)
  applyAttribute('data-locale', injected?.locale ?? fallback.locale)
  if (injected?.first === true || fallback.first) {
    document.documentElement.setAttribute('data-first', '1')
  }
  if (injected?.setup === true || fallback.setup) {
    // 这一轮启动还没有选定的用户目录。骨架屏承诺的是"等着，马上就完"，而这一屏要的是用户
    // 读字、做决定——两者放在一起只会让人以为界面卡住了。样式表按这个属性把 #splash 藏起来
    // （`index.html`，由 tests/splash-contract.test.ts 钉住），`main.tsx` 读的是同一个注入。
    document.documentElement.setAttribute('data-setup', '1')
  }
} catch {
  // 读不到输入：静态默认值已经生效，什么都不用做。
}
