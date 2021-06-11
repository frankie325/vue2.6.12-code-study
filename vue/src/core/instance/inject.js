/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

export function initProvide (vm: Component) {
  // 拿到provide，在合并策略中，可以知道provide为一个方法
  const provide = vm.$options.provide
  if (provide) {
    // 执行provide后，拿到provide数据并复制到实例上
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

export function initInjections (vm: Component) {
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    toggleObserving(false)
    // 对result进行响应式处理
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          // 不建议在子组件去更改这些数据，因为一旦祖代组件中 注入的 provide 发生更改，你在组件中做的更改就会被覆盖
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true)
  }
}


/* 
  resolveInject方法，会解析 inject 配置项，从祖代组件的 provide 配置中找到 key 对应的值，否则用 默认值
*/
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    // 拿到inject的所有属性
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)

    // 遍历inject
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      // 拿到inject数据指向的provideKey
      const provideKey = inject[key].from
      let source = vm
      while (source) {
        // 判断实例上是否有provide数据指向的provideKey是否存在
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          // 找到了跳出这层循环
          break
        }
        // 找不到，一层层往父级找
        source = source.$parent
      }
      // 找不到了
      if (!source) {
        // 判断inject属性是否有默认值
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          // 默认值如果是方法，执行call()
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          // 否则报警告
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    // 返回找到的所有值
    return result
  }
}
