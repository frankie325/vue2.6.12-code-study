/* @flow */

import { remove, isDef } from 'shared/util'

export default {
  create (_: any, vnode: VNodeWithData) {
    // 添加ref
    registerRef(vnode)
  },
  update (oldVnode: VNodeWithData, vnode: VNodeWithData) {
    // 更新ref
    if (oldVnode.data.ref !== vnode.data.ref) {
      // 先删除老的ref
      registerRef(oldVnode, true)
      // 再添加新的ref
      registerRef(vnode)
    }
  },
  destroy (vnode: VNodeWithData) {
    // 移除ref
    registerRef(vnode, true)
  }
}

// 注册与移除ref
export function registerRef (vnode: VNodeWithData, isRemoval: ?boolean) {
  // 拿到ref属性
  const key = vnode.data.ref
  if (!isDef(key)) return

  // 该VNode所在的组件实例
  const vm = vnode.context
  // 如果该VNode是组件VNode，那么ref为组件实例。如果是普通的标签VNode，则ref为DOM元素
  const ref = vnode.componentInstance || vnode.elm
  const refs = vm.$refs
  if (isRemoval) { //为true，说明是移除
    if (Array.isArray(refs[key])) {
      // 如果是数组，从数组中移除
      remove(refs[key], ref)
    } else if (refs[key] === ref) {
      // 如果存在的话，置为undefined
      refs[key] = undefined
    }
  } else {
    // 进行添加
    if (vnode.data.refInFor) {//如果是v-for内的节点
      if (!Array.isArray(refs[key])) {
        // 不是数组则转为数组
        refs[key] = [ref]
      } else if (refs[key].indexOf(ref) < 0) {
        // $flow-disable-line
        // 不存在于数组，再添加进数组
        refs[key].push(ref)
      }
    } else { //不在v-for循环内
      // 直接进行赋值
      refs[key] = ref 
    }
  }
}
