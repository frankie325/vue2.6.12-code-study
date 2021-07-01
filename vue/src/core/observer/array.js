/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 创建空对象，原型指向Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 操作数组的七个方法，将这7个方法进行改写到arrayMethods对象里
 */
methodsToPatch.forEach(function (method) {
  // 缓存原生方法的值
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__//当操作该数组时，拿到该数组的观察者实例
    let inserted //新插入的值
    // 下面三个方法会插入新的值
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 对新插入的元素做响应式处理 
    if (inserted) ob.observeArray(inserted)
    // 通知依赖更新
    ob.dep.notify()
    return result
  })
})
