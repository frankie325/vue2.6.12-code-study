/* @flow */

import { extend, warn, isObject } from 'core/util/index'

/**
 * Runtime helper for rendering <slot>
 */
/*
  根据slot标签的name属性，找到$scopedSlots中对应的方法，得到VNode
*/
export function renderSlot (
  name: string, //slot标签的name属性
  fallbackRender: ?((() => Array<VNode>) | Array<VNode>), //slot标签内的子标签的渲染函数
  props: ?Object, //slot标签上的属性
  bindObject: ?Object //slot标签上v-bind绑定的对象形式值
): ?Array<VNode> {
  // 拿到name属性在$scopedSlots中的方法
  const scopedSlotFn = this.$scopedSlots[name]
  let nodes
  if (scopedSlotFn) { //如果该方法存在
    // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        // 不带参数的v-bind绑定的值，需要是对象类型
        warn('slot v-bind without argument expects an Object', this)
      }
      // 进slot标签上绑定的属性合并到一个对象中
      props = extend(extend({}, bindObject), props)
    }
    nodes =
      scopedSlotFn(props) || //执行scopedSlotFn
      (fallbackRender && //scopedSlotFn如果为返回VNode，则调用fallbackRender，返回slot标签内的VNode
        (Array.isArray(fallbackRender) ? fallbackRender : fallbackRender()))
  } else {
    // scopedSlotFn方法不存在，则在$slots中去找
    nodes =
      this.$slots[name] ||
      (fallbackRender &&
        (Array.isArray(fallbackRender) ? fallbackRender : fallbackRender()))
  }

  // 如果slot标签上还存在slot属性
  const target = props && props.slot
  if (target) {
    // 则将渲染出来的插槽内容再包一层template标签，并添加slot属性
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
