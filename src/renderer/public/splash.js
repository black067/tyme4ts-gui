/**
 * 首帧引导脚本：经典脚本，先于任何 module 同步执行。
 *
 * 把主进程塞在查询串里的设置写进 <html>（data-theme / data-locale / data-first），
 * 骨架屏于是从第一帧起就是用户真正的主题、语言与首启文案。任何一步失败都保持
 * index.html 里的静态默认值——最坏情况是骨架屏用 zh-Hans + minimal-light，
 * 绝不会白屏。
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

try {
  const query = new URLSearchParams(window.location.search)
  applyAttribute('data-theme', query.get('dt'))
  applyAttribute('data-locale', query.get('locale'))
  if (query.get('first') === '1') {
    document.documentElement.setAttribute('data-first', '1')
  }
} catch {
  // 读不到查询串：静态默认值已经生效，什么都不用做。
}
