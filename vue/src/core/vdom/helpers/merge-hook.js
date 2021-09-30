/* @flow */

import VNode from '../vnode'
import { createFnInvoker } from './update-listeners'
import { remove, isDef, isUndef, isTrue } from 'shared/util'

/*
  调用该方法时，如果是组件VNode，会将组件VNode的hook与传入的hook方法进行合并
  当执行到对应钩子的时候，经过该方法合并的钩子调用后会删除，而组件VNode原本的hook方法不会删除
  而对于普通标签VNode来说，本来就没有data.hook对象（除非用户使用渲染函数时传入了hook钩子），
  然后经过该方法调用生成hook钩子，执行钩子时又会删除
*/
export function mergeVNodeHook (def: Object, hookKey: string, hook: Function) {
  if (def instanceof VNode) {
    // 拿到VNode上的hook对象
    def = def.data.hook || (def.data.hook = {})
  }
  let invoker
  const oldHook = def[hookKey] //拿到旧的hook钩子

  // 包装一层要执行的hook方法
  function wrappedHook () {
    hook.apply(this, arguments)
    // important: remove merged hook to ensure it's called only once
    // and prevent memory leak
    // 删除合并的钩子以确保它只被调用一次，并防止内存泄漏

    // 执行该函数时，会将该函数从数组中移除
    remove(invoker.fns, wrappedHook)
  }

  if (isUndef(oldHook)) {
    // 如果没有旧的hook钩子，说明不是组件VNode
    // no existing hook
    invoker = createFnInvoker([wrappedHook])
  } else {
    // 如果存在旧的hook钩子，说明是组件VNode

    /* istanbul ignore if */
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // 如果定义过了fns和merged，说明已经调用过mergeVNodeHook方法了
      // already a merged invoker
      invoker = oldHook
      // 直接推入到fns数组中
      invoker.fns.push(wrappedHook)
    } else {
      // existing plain hook
      // 没定义过fns，说明只是组件的钩子，将组件的钩子一起合并
      invoker = createFnInvoker([oldHook, wrappedHook])
    }
  }

  // 添加以及合并了的标志
  invoker.merged = true
  // 重新赋值到data.hook钩子上
  def[hookKey] = invoker
}
