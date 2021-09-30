/* @flow */

import type VNode from 'core/vdom/vnode'

/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 */
/*
 在生成AST的阶段，具名插槽标签节点（使用了slotScope属性和v-slot指令）是不会添加到组件AST的children属性中
 只使用了slot属性的标签和普通标签才会推入到children中
*/

/*
  将组件标签内的非具名插槽子节点，添加到组件实例的$slot中
  最终返回一个对象
  $slots = {
      default:[VNode,VNode...],
      slotName:[VNode,VNode...]
  }
*/
export function resolveSlots (
  children: ?Array<VNode>, //该组件的子节点VNode
  context: ?Component //该组件的父组件实例
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) {
    return {}
  }
  const slots = {}
  // 遍历子组件VNode
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    // 如果节点被解析为 Vue slot 节点，则移除 slot 属性
    // 因为非template标签只是用了slot属性的话，会往attrs添加slot属性，作为原生html的slot属性
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    // 组件的子节点所在父组件实例需要和组件所在的父组件实例一样
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {
      const name = data.slot//slot属性值
      const slot = (slots[name] || (slots[name] = []))
      
      if (child.tag === 'template') {// 如果子节点是template标签
        // 将template内的VNode节点推入到slot中
        slot.push.apply(slot, child.children || [])
      } else {
        // 否则直接将子节点VNode推入
        slot.push(child)
      }
    } else {
      // 不存在slot属性，则作为默认插槽内容
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  for (const name in slots) {
    // 如果插槽内容节点内都是注释VNode或者空文本VNode
    if (slots[name].every(isWhitespace)) {
      // 则删除该插槽内容
      delete slots[name]
    }
  }
  return slots
}

// 是注释文本节点但不是函数组件的替换注释文本  或者是空文本节点，返回true
function isWhitespace (node: VNode): boolean {
  return (node.isComment && !node.asyncFactory) || node.text === ' '
}
