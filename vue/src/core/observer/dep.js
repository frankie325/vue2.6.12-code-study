/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 每个进行响应式处理的数据都会创建一个dep实例
 */
export default class Dep {
  static target: ?Watcher;
  //target静态属性， Dep.target = 当前正在执行的 watcher，同一时间只会有一个watcher 在执行
  id: number; 
  // dep实例的id
  subs: Array<Watcher>;
  // dep实例收集的watcher

  constructor () {
    this.id = uid++
    this.subs = []
  }

  // 往dep实例添加watcher
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  // 移除收集的watcher
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      // 向当前watcher添加dep实例
      Dep.target.addDep(this)
    }
  }

  // 通知dep实例收集的所有watcher进行更新
  notify () {
    // stabilize the subscriber list first
    // 当前dep实例收集的所有watcher
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      // 遍历所有watcher，执行update方法
      subs[i].update()
    }
  }
}

// 为什么需要targetStack来管理？
// https://segmentfault.com/q/1010000010095427/a-1020000010103282
Dep.target = null
const targetStack = []

export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
