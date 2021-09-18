/* @flow */

import { extend, warn, isObject } from 'core/util/index'

/**
 * Runtime helper for rendering <slot>
 */
// 渲染slot标签
export function renderSlot (
  name: string, //slot标签的name属性
  fallbackRender: ?((() => Array<VNode>) | Array<VNode>), //slot标签内的子标签的渲染函数
  props: ?Object, //slot标签上的属性
  bindObject: ?Object //slot标签上v-bind绑定的对象形式值
): ?Array<VNode> {
  const scopedSlotFn = this.$scopedSlots[name]
  let nodes
  if (scopedSlotFn) {
    // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn('slot v-bind without argument expects an Object', this)
      }
      props = extend(extend({}, bindObject), props)
    }
    nodes =
      scopedSlotFn(props) ||
      (fallbackRender &&
        (Array.isArray(fallbackRender) ? fallbackRender : fallbackRender()))
  } else {
    // 
    nodes =
      this.$slots[name] ||
      (fallbackRender &&
        (Array.isArray(fallbackRender) ? fallbackRender : fallbackRender()))
  }

  const target = props && props.slot
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
