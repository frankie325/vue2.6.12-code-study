/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
// 用于解析html标记、组件名称和属性路径的unicode字母
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/
// unicodeRegExp.source = "a-zA-Z\\u00B7\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u203F-\\u2040\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD"
/**
 * Check if a string starts with $ or _
  检查传入的字符串第一个字母是不是$或者_开头的
 */
export function isReserved (str: string): boolean {
  // charCodeAt返回指定索引的UTF-16编码
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
改写Object.defineProperty方法，指定相应的key能不能进行遍历
 */
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
  解析watch监听的key值，形如"a.b.c"
 */
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)
export function parsePath (path: string): any {
  if (bailRE.test(path)) {
    return
  }
  // 分割成数组
  const segments = path.split('.')
  // 返回一个方法，watcher中this.getter等于该方法
  // 执行this.getter，obj为传入的vm实例
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return //不存在则返回
      // 循环完之后得到在vm实例中的值
      obj = obj[segments[i]]
    }
    // 返回该值
    return obj
  }
}
