/* @flow */

import {
  isDef,
  isUndef
} from 'shared/util'

import {
  concat,
  stringifyClass,
  genClassForVnode
} from 'web/util/index'

function updateClass (oldVnode: any, vnode: any) {
  const el = vnode.elm
  const data: VNodeData = vnode.data  //新的VNode数据
  const oldData: VNodeData = oldVnode.data //旧的VNode数据
  if (
    isUndef(data.staticClass) &&
    isUndef(data.class) && (
      isUndef(oldData) || (
        isUndef(oldData.staticClass) &&
        isUndef(oldData.class)
      )
    )
  ) {
    // 如果都没有定义class或者staticClass属性，直接返回
    return
  }

  // 生成class属性值 为"className1 className2..."
  let cls = genClassForVnode(vnode)

  // handle transition classes
  // 处理transition组件上的class
  const transitionClass = el._transitionClasses
  if (isDef(transitionClass)) {
    cls = concat(cls, stringifyClass(transitionClass))
  }

  // set the class
  if (cls !== el._prevClass) { //如果新的class值和缓存的不一样，才会进行赋值
    el.setAttribute('class', cls) //设置标签的class属性
    // 缓存当前的class值
    el._prevClass = cls
  }
}

export default {
  create: updateClass,
  update: updateClass
}
