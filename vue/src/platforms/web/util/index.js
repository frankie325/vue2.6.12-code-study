/* @flow */

import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
export function query (el: string | Element): Element {
  if (typeof el === 'string') {
    // 如果是字符串，找到该DOM元素
    const selected = document.querySelector(el)
    if (!selected) {
      // 没找到报错
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      // 返回一个空的div
      return document.createElement('div')
    }
    return selected
  } else {
    // 不是字符串，直接返回该元素
    return el
  }
}
