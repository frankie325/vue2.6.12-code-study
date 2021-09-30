/* @flow */

import {
  warn,
  invokeWithErrorHandling
} from 'core/util/index'
import {
  cached,
  isUndef,
  isTrue,
  isPlainObject
} from 'shared/util'

// 处理事件名称
const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>
} => {
  // 以&开头，passive为true
  const passive = name.charAt(0) === '&'
  name = passive ? name.slice(1) : name
  // 以~开头，once为true
  const once = name.charAt(0) === '~' // Prefixed last, checked first
  name = once ? name.slice(1) : name
  // 以!开头，pcapture为true
  const capture = name.charAt(0) === '!'
  name = capture ? name.slice(1) : name
  return {
    name,
    once,
    capture,
    passive
  }
})


// 生成一个invoker，调用存储在自身的fns函数
export function createFnInvoker (fns: Function | Array<Function>, vm: ?Component): Function {
  // 创建一个invoker函数
  function invoker () {
    // 拿到挂在自己身上的要执行的fns方法
    const fns = invoker.fns
    if (Array.isArray(fns)) {
      // fns是数组的话
      const cloned = fns.slice()
      // 执行里面的每个方法
      for (let i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(cloned[i], null, arguments, vm, `v-on handler`)
      }
    } else {
      // return handler return value for single handlers
      // 否则，就直接执行
      return invokeWithErrorHandling(fns, null, arguments, vm, `v-on handler`)
    }
  }
  // 往invoker函数上添加要执行的fns方法
  invoker.fns = fns
  // 返回invoker函数
  return invoker
}

export function updateListeners (
  on: Object, //新的事件选项
  oldOn: Object,//旧的事件选项
  add: Function, //添加事件方法
  remove: Function, //移除事件方法
  createOnceHandler: Function, //添加执行一次的事件
  vm: Component //VNode所在的组件实例
) {
  let name, def, cur, old, event
  for (name in on) { //遍历新的事件选项
    def = cur = on[name] 
    old = oldOn[name] //对应的旧的事件
    event = normalizeEvent(name)
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler
      event.params = def.params
    }
    if (isUndef(cur)) {
      // 没有提供事件函数，报错
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    } else if (isUndef(old)) { //如果旧的不存在，说明是新增的事件
      if (isUndef(cur.fns)) {
        // 调用createFnInvoke将函数进行一层包裹，可以处理函数中异步报错
        cur = on[name] = createFnInvoker(cur, vm)
      }
      if (isTrue(event.once)) { //如果只执行一次，再调用createOnceHandler创建一次执行函数
        cur = on[name] = createOnceHandler(event.name, cur, event.capture)
      }
      // 往目标DOM元素上添加事件
      add(event.name, cur, event.capture, event.passive, event.params)
    } else if (cur !== old) {
      // 如果新值不等于旧值
      old.fns = cur //fns赋值为新值
      on[name] = old
    }
  }
  for (name in oldOn) { //遍历旧值
    if (isUndef(on[name])) { //在新的选项中不存在
      event = normalizeEvent(name)
      // 从目标DOM元素移除该事件
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
