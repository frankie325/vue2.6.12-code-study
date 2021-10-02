/* @flow */

import config from 'core/config'
import { hyphenate } from 'shared/util'

function isKeyNotMatch<T> (expect: T | Array<T>, actual: T): boolean {
  if (Array.isArray(expect)) {
    // 如果是数组，判断事件触发时的keyName是否存在于用户写的键盘修饰符对应的keyName
    // 不存在，条件成立，终止事件执行
    return expect.indexOf(actual) === -1
  } else {
    // 不是数组，直接判断是否不等于
    // 不相等，条件成立，终止事件执行
    return expect !== actual
  }
}

/**
 * Runtime helper for checking keyCodes from config.
 * exposed as Vue.prototype._k
 * passing in eventKeyName as last argument separately for backwards compat
 */
// 判断事件触发时的键盘按键是否与键盘按键修饰符一致
export function checkKeyCodes (
  eventKeyCode: number,  //事件触发时的keyCode
  key: string, //用户写的键盘修饰符
  builtInKeyCode?: number | Array<number>,//用户写的键盘修饰符对应的keyCode
  eventKeyName?: string, //事件触发时的keyName
  builtInKeyName?: string | Array<string> //用户写的键盘修饰符对应的keyName
): ?boolean {
  // 拿到用户在全局定义的键盘修饰符的keyCode别名，没有就用默认的
  const mappedKeyCode = config.keyCodes[key] || builtInKeyCode
  if (builtInKeyName && eventKeyName && !config.keyCodes[key]) {
    // 如果两者都存在keyName，直接用keyName去判断是否相等
    return isKeyNotMatch(builtInKeyName, eventKeyName)
  } else if (mappedKeyCode) {
    // keyName不存在，如果两者都存在keyCode，用keyCode去判断是否相等
    return isKeyNotMatch(mappedKeyCode, eventKeyCode)
  } else if (eventKeyName) {
    // 如果只有事件触发时的keyName，则转为连字符后判断是否等于键盘修饰符
    return hyphenate(eventKeyName) !== key
  }
  // 都不成立，看是不是undefined，是undefined，会终止事件执行
  return eventKeyCode === undefined
}
