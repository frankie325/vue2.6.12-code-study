/* @flow */

import { isDef, isUndef, extend, toNumber } from 'shared/util'
import { isSVG } from 'web/util/index'

let svgContainer

// 更新DOM属性
function updateDOMProps (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (isUndef(oldVnode.data.domProps) && isUndef(vnode.data.domProps)) {
    // 如果没有定义domProps，直接返回
    return
  }
  let key, cur
  const elm: any = vnode.elm
  const oldProps = oldVnode.data.domProps || {} //旧的domProps
  let props = vnode.data.domProps || {} //新的domProps
  // clone observed objects, as the user probably wants to mutate it
  // 如果是响应式的，克隆一份，防止用户改变它
  if (isDef(props.__ob__)) {
    props = vnode.data.domProps = extend({}, props)
  }

  for (key in oldProps) { //遍历旧的domProps
    if (!(key in props)) {//如果在新的中不存在
      elm[key] = '' //赋值为空
    }
  }

  for (key in props) { //遍历新的domProps
    cur = props[key]
    // ignore children if the node has textContent or innerHTML,
    // as these will throw away existing DOM nodes and cause removal errors
    // on subsequent patches (#3360)
    if (key === 'textContent' || key === 'innerHTML') { //如果存在textContent和innerHTML，即标签上使用了v-text和v-html
      if (vnode.children) vnode.children.length = 0  //清空子VNode
      if (cur === oldProps[key]) continue //新值与旧值相等，跳过
      // #6601 work around Chrome version <= 55 bug where single textNode
      // replaced by innerHTML/textContent retains its parentNode property
      // 解决低版本chrome的bug
      if (elm.childNodes.length === 1) {
        elm.removeChild(elm.childNodes[0])
      }
    }

    if (key === 'value' && elm.tagName !== 'PROGRESS') {
      // store value as _value as well since
      // non-string values will be stringified
      elm._value = cur
      // avoid resetting cursor position when value is the same
      const strCur = isUndef(cur) ? '' : String(cur) 
      if (shouldUpdateValue(elm, strCur)) {
        elm.value = strCur
      }
    } else if (key === 'innerHTML' && isSVG(elm.tagName) && isUndef(elm.innerHTML)) {
      // IE doesn't support innerHTML for SVG elements
      // 解决IE svg不支持v-html的语法
      svgContainer = svgContainer || document.createElement('div')
      svgContainer.innerHTML = `<svg>${cur}</svg>`
      const svg = svgContainer.firstChild
      while (elm.firstChild) {
        elm.removeChild(elm.firstChild)
      }
      while (svg.firstChild) {
        elm.appendChild(svg.firstChild)
      }
    } else if (
      // skip the update if old and new VDOM state is the same.
      // `value` is handled separately because the DOM value may be temporarily
      // out of sync with VDOM state due to focus, composition and modifiers.
      // This  #4521 by skipping the unnecessary `checked` update.
      cur !== oldProps[key]
    ) { //如果新值与旧值不相等，进行赋值
      // some property updates can throw
      // e.g. `value` on <progress> w/ non-finite value
      try {
        elm[key] = cur
      } catch (e) {}
    }
  }
}

// check platforms/web/util/attrs.js acceptValue
type acceptValueElm = HTMLInputElement | HTMLSelectElement | HTMLOptionElement;

// 是否应该更新value值
function shouldUpdateValue (elm: acceptValueElm, checkVal: string): boolean {
  return (!elm.composing && (
    elm.tagName === 'OPTION' ||
    isNotInFocusAndDirty(elm, checkVal) ||
    isDirtyWithModifiers(elm, checkVal)
  ))
}

function isNotInFocusAndDirty (elm: acceptValueElm, checkVal: string): boolean {
  // return true when textbox (.number and .trim) loses focus and its value is
  // not equal to the updated value
  let notInFocus = true
  // #6157
  // work around IE bug when accessing document.activeElement in an iframe
  try { notInFocus = document.activeElement !== elm } catch (e) {}
  return notInFocus && elm.value !== checkVal
}

function isDirtyWithModifiers (elm: any, newVal: string): boolean {
  const value = elm.value //旧的value值
  const modifiers = elm._vModifiers // injected by v-model runtime 运行时处理v-model时添加了该属性
  if (isDef(modifiers)) { 
    if (modifiers.number) {  // 转为number比较新值与旧值是否相等
      return toNumber(value) !== toNumber(newVal)
    }
    if (modifiers.trim) { //去掉两边空格比较是否相等
      return value.trim() !== newVal.trim()
    }
  }
  return value !== newVal
}

export default {
  create: updateDOMProps,
  update: updateDOMProps
}
