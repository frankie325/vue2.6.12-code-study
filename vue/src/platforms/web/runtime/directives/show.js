/* @flow */

import { enter, leave } from '../modules/transition'

// recursively search for possible transition defined inside the component root
/*
  如果是组件VNode，则拿到组件内的根节点
*/
function locateNode (vnode: VNode): VNodeWithData {
  return vnode.componentInstance && (!vnode.data || !vnode.data.transition)
    ? locateNode(vnode.componentInstance._vnode)
    : vnode
}

export default {
  // 注册阶段
  bind (el: any, { value }: VNodeDirective, vnode: VNodeWithData) {
    vnode = locateNode(vnode) //如果是组件VNode，则拿到组件内的根节点
    const transition = vnode.data && vnode.data.transition
    // __vOriginalDisplay保存使用v-show前display属性的值
    // v-show如果绑定的值是真值，那么保持原来的值不变
    // 但如果绑定的是假值，赋值为none
    const originalDisplay = el.__vOriginalDisplay =
      el.style.display === 'none' ? '' : el.style.display //如果使用v-show之前display为none，赋值为''
      // 因为下面赋值时，v-show绑定了真值，还赋值为none就不行了
    if (value && transition) { //如果value为真值且transition
      vnode.data.show = true //给vnode的data添加show属性
      enter(vnode, () => {
        el.style.display = originalDisplay
      })
    } else { //一般走这里
      // 如果value是真值，使用之前的值，否则赋值为none
      el.style.display = value ? originalDisplay : 'none'
    }
  },

  // 更新阶段
  update (el: any, { value, oldValue }: VNodeDirective, vnode: VNodeWithData) {
    /* istanbul ignore if */
    if (!value === !oldValue) return //如果旧值和新值相等，直接返回
    vnode = locateNode(vnode)
    const transition = vnode.data && vnode.data.transition
    if (transition) {
      vnode.data.show = true
      if (value) {
        enter(vnode, () => {
          el.style.display = el.__vOriginalDisplay
        })
      } else {
        leave(vnode, () => {
          el.style.display = 'none'
        })
      }
    } else {
      el.style.display = value ? el.__vOriginalDisplay : 'none'
    }
  },

  // 解绑阶段
  unbind (
    el: any,
    binding: VNodeDirective,
    vnode: VNodeWithData,
    oldVnode: VNodeWithData,
    isDestroy: boolean
  ) {
    if (!isDestroy) {
      // 解绑时，赋值为原先的值
      el.style.display = el.__vOriginalDisplay
    }
  }
}
