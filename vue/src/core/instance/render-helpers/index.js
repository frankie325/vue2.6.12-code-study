/* @flow */

import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

export function installRenderHelpers (target: any) {
  // 对v-once节点进行标记
  target._o = markOnce
  // 转化成number
  target._n = toNumber
  // 转化成字符
  target._s = toString
  // 渲染v-for
  target._l = renderList
  // 渲染slot标签
  target._t = renderSlot
  target._q = looseEqual
  target._i = looseIndexOf
  // 渲染静态根节点
  target._m = renderStatic
  target._f = resolveFilter
  target._k = checkKeyCodes
  target._b = bindObjectProps
  target._v = createTextVNode
  target._e = createEmptyVNode
  target._u = resolveScopedSlots
  target._g = bindObjectListeners
  // 处理动态绑定的属性
  target._d = bindDynamicKeys
  target._p = prependModifier
}
