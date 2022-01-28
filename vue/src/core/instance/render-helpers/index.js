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
  // 对v-for内的v-once节点进行标记
  target._o = markOnce
  // 转化成number
  target._n = toNumber
  // 转化成字符
  target._s = toString
  // 渲染v-for
  target._l = renderList
  // 渲染slot标签
  target._t = renderSlot
  // 检查两个值是否大致相等
  target._q = looseEqual
  // 返回值在数组中的索引
  target._i = looseIndexOf
  // 渲染静态根节点
  target._m = renderStatic
  // 处理过滤器
  target._f = resolveFilter
  // 处理事件出发时的键盘修饰符
  target._k = checkKeyCodes
  // 当绑定的是对象和数组形式时，将渲染函数的第二个参数data进行一下处理
  target._b = bindObjectProps
  // 创建空文本VNode
  target._v = createTextVNode
  // 创建空注释VNode
  target._e = createEmptyVNode
  // 处理组件VNode上的ScopedSlots属性
  target._u = resolveScopedSlots
  // 当绑定的事件是对象形式时，将渲染函数的第二个参数data进行一下处理
  target._g = bindObjectListeners
  // 处理动态绑定的属性
  target._d = bindDynamicKeys
  // 处理动态绑定事件，且带有.capture、.once、.passive修饰符
  target._p = prependModifier
}
