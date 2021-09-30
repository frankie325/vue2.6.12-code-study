/* @flow */

import { def } from 'core/util/lang'
import { normalizeChildren } from 'core/vdom/helpers/normalize-children'
import { emptyObject } from 'shared/util'
import { isAsyncPlaceholder } from './is-async-placeholder'


/*
  normalizeScopedSlots函数用来生成$scopedSlots的内容
  $scopedSlots内包含了具名插槽和非具名插槽，如果slotTarget重复了，以具名插槽优先
  生成的$scopedSlots
  {
    slotTarget1:function normalized(){...}, //执行返回插槽节点的VNode
    slotTarget2:()=>{}  //执行返回非具名插槽节点的VNode
    ...
    $stable: false //是否稳定
    $hasNormal: true //是否有非具名插槽内容
    $key: undefined //唯一的hash值
  }
*/
export function normalizeScopedSlots (
  slots: { [key: string]: Function } | void, //最新的scopedSlots
  normalSlots: { [key: string]: Array<VNode> },// $slots，非具名插槽内容
  prevSlots?: { [key: string]: Function } | void //组件更新前的$scopedSlots
): any {
  let res
  const hasNormalSlots = Object.keys(normalSlots).length > 0 //是否存在$slots
  const isStable = slots ? !!slots.$stable : !hasNormalSlots //是否稳定，为true就不要强制更新了
  const key = slots && slots.$key 
  if (!slots) {
    res = {}
  } else if (slots._normalized) {
    // 如果是父组件更新了，传进的最新的scopedSlots会是一个新的对象，没有_normalized属性
    // 所以当还存在_normalized，说明只有子组件更新了，因为父组件没更新，插槽内容也就没有更新，获取之前的缓存就行
    // fast path 1: child component re-render only, parent did not change
    return slots._normalized
  } else if (
    isStable && //稳定的
    prevSlots && 
    prevSlots !== emptyObject && //之前的$scopedSlots内容不为空
    key === prevSlots.$key && //key没变化，即插槽内容没有变化
    !hasNormalSlots && //没有$slot普通插槽内容
    !prevSlots.$hasNormal
  ) {
    // fast path 2: stable scoped slots w/ no normal slots to proxy,
    // only need to normalize once
    // 对于稳定的插槽节点
    // 则使用之前的$scopedSlots
    return prevSlots
  } else {
    // 走到这里就需要更新插槽节点内容了
    res = {}
    for (const key in slots) { //遍历最新的scopedSlots内容
      if (slots[key] && key[0] !== '$') {
        // 调用normalizeScopedSlot得到一个函数，执行时可以的到插槽节点的VNode
        res[key] = normalizeScopedSlot(normalSlots, key, slots[key])
      }
    }
  }
  // expose normal slots on scopedSlots
  // 暴露非具名插槽到$scopedSlots
  for (const key in normalSlots) { //遍历$slot
    if (!(key in res)) { //如果不在res，也添加到res中，所以如果slotTarget重复了，以具名插槽优先
      res[key] = proxyNormalSlot(normalSlots, key) //为一个函数，执行时返回对应的VNode
    }
  }
  // avoriaz seems to mock a non-extensible $scopedSlots object
  // and when that is passed down this would cause an error
  if (slots && Object.isExtensible(slots)) {
    // 将结果缓存
    (slots: any)._normalized = res
  }

  // 往res添加下列属性，不可遍历
  def(res, '$stable', isStable)
  def(res, '$key', key)
  def(res, '$hasNormal', hasNormalSlots)
  return res
}

// 归一化处理插槽的VNode
function normalizeScopedSlot(normalSlots, key, fn) {
  const normalized = function () {
    // 执行fn得到插槽节点的VNode
    let res = arguments.length ? fn.apply(null, arguments) : fn({})
    res = res && typeof res === 'object' && !Array.isArray(res)
      ? [res] // single vnode //单个VNode
      : normalizeChildren(res) //多个VNode需要进行归一化
    let vnode: VNode = res && res[0]

    // 返回的到的VNode
    return res && (
      !vnode ||
      (vnode.isComment && !isAsyncPlaceholder(vnode)) // #9658, #10391
    ) ? undefined
      : res
  }
  // this is a slot using the new v-slot syntax without scope. although it is
  // compiled as a scoped slot, render fn users would expect it to be present
  // on this.$slots because the usage is semantically a normal slot.
  /*
    这是一个使用没有作用域的新 v-slot 语法的插槽。 虽然它是
    编译为作用域插槽 用户希望它存在
    在 this.$slots 上，因为用法在语义上是一个普通的插槽
  */
  if (fn.proxy) {
    Object.defineProperty(normalSlots, key, {
      get: normalized,
      enumerable: true,
      configurable: true
    })
  }
  // 返回该函数
  return normalized
}

// 返回一个函数，执行时返回$slots中对应的VNode
function proxyNormalSlot(slots, key) {
  return () => slots[key]
}
