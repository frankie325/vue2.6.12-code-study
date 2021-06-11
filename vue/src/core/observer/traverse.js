/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
traverse对一个数组或对象做深层递归遍历，因为遍历过程中就是对一个子对象的访问，
会触发它们的 getter 过程，这样就可以收集到依赖watcher实例
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear() //清空Set中的元素
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    // 不是数组且不是对象，是对象但不可配置，Vnode实例
    // 满足上面3个条件之一，直接返回
    return
  }
  if (val.__ob__) {
    // 如果存在__ob__观察者实例
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      // 有了就不添加，避免重复收集依赖，直接返回
      return
    }
    // 将dep实例的Id推入到Set集合中
    seen.add(depId)
  }
  if (isA) {
    // 是数组，继续递归
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    // 是对象。继续递归对象
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
