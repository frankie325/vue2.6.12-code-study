/* @flow */

import { isObject, isDef, hasSymbol } from 'core/util/index'

/**
 * Runtime helper for rendering v-for lists.
 */
// 渲染v-for循环的节点，返回一个VNode数组
export function renderList (
  val: any, //v-for循环的值
  render: (
    val: any,
    keyOrIndex: string | number,
    index?: number
  ) => VNode
): ?Array<VNode> {

  let ret: ?Array<VNode>, i, l, keys, key
  if (Array.isArray(val) || typeof val === 'string') {
    // 1.如果是对象或者是字符
    ret = new Array(val.length)
    // 进行遍历
    for (i = 0, l = val.length; i < l; i++) {
      // 调用第二个参数
      // 生成VNode数组
      ret[i] = render(val[i], i) //值，索引
    }
  } else if (typeof val === 'number') {
    // 2.如果是数字
    ret = new Array(val) //生成以该数字为长度的数组
    // 遍历
    for (i = 0; i < val; i++) {
      ret[i] = render(i + 1, i) //数值，索引
    }
  } else if (isObject(val)) {
    // 3.如果是对象且是可迭代对象，比如Set，Map类型，arguments参数
    if (hasSymbol && val[Symbol.iterator]) {
      ret = []
      // 直接调用迭代器去遍历该对象
      const iterator: Iterator<any> = val[Symbol.iterator]()
      let result = iterator.next()
      while (!result.done) {
        ret.push(render(result.value, ret.length))
        result = iterator.next()
      }
    } else {
      // 不是可迭代对象，则调用Object.keys去遍历
      keys = Object.keys(val)
      ret = new Array(keys.length)
      // 遍历
      for (i = 0, l = keys.length; i < l; i++) {
        key = keys[i]
        ret[i] = render(val[key], key, i) //对象值，对象key，索引
      }
    }
  }
  if (!isDef(ret)) {
    // 没有，则为空数组
    ret = []
  }
  // 为该VNode数组添加_isVList属性，说明是v-for循环的节点
  (ret: any)._isVList = true
  return ret
}
