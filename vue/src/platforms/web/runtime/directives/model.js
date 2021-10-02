/**
 * Not type checking this file because flow doesn't like attaching
 * properties to Elements.
 */

import { isTextInputType } from 'web/util/element'
import { looseEqual, looseIndexOf } from 'shared/util'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { warn, isIE9, isIE, isEdge } from 'core/util/index'

/* istanbul ignore if */
if (isIE9) {
  // http://www.matts411.com/post/internet-explorer-9-oninput/
  document.addEventListener('selectionchange', () => {
    const el = document.activeElement
    if (el && el.vmodel) {
      trigger(el, 'input')
    }
  })
}

const directive = {
  // 元素插入父节点阶段
  inserted (el, binding, vnode, oldVnode) {
    if (vnode.tag === 'select') { //如果是select标签
      // #6903
      if (oldVnode.elm && !oldVnode.elm._vOptions) {
        mergeVNodeHook(vnode, 'postpatch', () => {
          directive.componentUpdated(el, binding, vnode)
        })
      } else {
        // 设置select标签的勾选状态
        setSelected(el, binding, vnode.context)
      }
      el._vOptions = [].map.call(el.options, getValue) //拿到所有option标签的value属性，放入_vOptions数组中
    } else if (vnode.tag === 'textarea' || isTextInputType(el.type)) {
      // 如果是输入类型的input标签
      el._vModifiers = binding.modifiers//拿到v-model的修饰符
      if (!binding.modifiers.lazy) { //如果没有lazy修饰符

        // 添加输入法开始输入和结束输入事件
        el.addEventListener('compositionstart', onCompositionStart)
        el.addEventListener('compositionend', onCompositionEnd)
        // Safari < 10.2 & UIWebView doesn't fire compositionend when
        // switching focus before confirming composition choice
        // this also fixes the issue where some browsers e.g. iOS Chrome
        // fires "change" instead of "input" on autocomplete.
        el.addEventListener('change', onCompositionEnd)
        /* istanbul ignore if */
        if (isIE9) {
          el.vmodel = true
        }
      }
    }
  },

  // 元素更新阶段
  componentUpdated (el, binding, vnode) {
    if (vnode.tag === 'select') {
      setSelected(el, binding, vnode.context)
      // in case the options rendered by v-for have changed,
      // it's possible that the value is out-of-sync with the rendered options.
      // detect such cases and filter out values that no longer has a matching
      // option in the DOM.
      const prevOptions = el._vOptions //之前的option标签的value属性值数组集合
      const curOptions = el._vOptions = [].map.call(el.options, getValue) //新的value属性值数组集合

      // 新的里面只要有一个不与旧的相等，则进入该if语句
      if (curOptions.some((o, i) => !looseEqual(o, prevOptions[i]))) {
        // trigger change event if
        // no matching option found for at least one value
        const needReset = el.multiple
          ? binding.value.some(v => hasNoMatchingOption(v, curOptions)) //多选的话，如果v-model绑定的数组，只要有一个在所有option标签的value属性中都匹配不到，返回true
          : binding.value !== binding.oldValue && hasNoMatchingOption(binding.value, curOptions)//单选的话且与旧值不相等，v-model绑定的值在所有option标签的value属性中都匹配不到，返回true
        //也就是v-model更新的值，只要在option中找不到，就手动触发change事件
        if (needReset) {
          trigger(el, 'change')
        }
      }
    }
  }
}

// 设置select标签的勾选状态
function setSelected (el, binding, vm) {
  actuallySetSelected(el, binding, vm)
  /* istanbul ignore if */
  if (isIE || isEdge) {
    setTimeout(() => {
      actuallySetSelected(el, binding, vm)
    }, 0)
  }
}

// 设置select标签的勾选状态
function actuallySetSelected (el, binding, vm) {
  const value = binding.value //v-model绑定的值
  const isMultiple = el.multiple //标签上的multiple属性
  if (isMultiple && !Array.isArray(value)) {
    // 如果v-model绑定的值不是数组，但是却有multiple属性，报错
    process.env.NODE_ENV !== 'production' && warn(
      `<select multiple v-model="${binding.expression}"> ` +
      `expects an Array value for its binding, but got ${
        Object.prototype.toString.call(value).slice(8, -1)
      }`,
      vm
    )
    return
  }
  let selected, option
  for (let i = 0, l = el.options.length; i < l; i++) { //遍历option标签
    option = el.options[i]
    if (isMultiple) { //如果是多选
      // 判断option标签绑定的值是否在v-model绑定的数组中
      selected = looseIndexOf(value, getValue(option)) > -1
      if (option.selected !== selected) { //和之前的状态不一样，才进行赋值
        option.selected = selected 
      }
    } else {
      // 不是多选，则判断两个值是不是相等
      if (looseEqual(getValue(option), value)) {
        if (el.selectedIndex !== i) { //和之前的状态不一样，才进行赋值
          el.selectedIndex = i  //通过selectedIndex来设置option的勾选状态
        }
        // 直接返回，剩下的不用继续判断了
        return
      }
    }
  }
  if (!isMultiple) {
    // 没有option标签且没有multiple属性会走这里
    // selectedIndex赋值为-1表明没有元素被选中
    el.selectedIndex = -1
  }
}

// v-model绑定的数组里的值，如果与所有option标签上的value属性都不想等，返回true
function hasNoMatchingOption (value, options) {
  return options.every(o => !looseEqual(o, value))
}

// 获取option标签的value属性值
function getValue (option) {
  return '_value' in option
    ? option._value
    : option.value
}

// 输入法事件触发时，往事件源添加一个composing标志，解决会同时触发input事件的bug
// 说明正在使用输入法输入
function onCompositionStart (e) {
  e.target.composing = true
}

// 输入法事件结束
function onCompositionEnd (e) {
  // prevent triggering an input event for no reason
  if (!e.target.composing) return
  e.target.composing = false //composing置为false
  trigger(e.target, 'input') //手动触发input事件
}

// trigger函数的作用就是可以通过代码触发对应的事件
function trigger (el, type) {
  const e = document.createEvent('HTMLEvents') // 创建事件
  e.initEvent(type, true, true) // 定义事件名为type的值
  el.dispatchEvent(e) //手动调用该事件
}

export default directive
