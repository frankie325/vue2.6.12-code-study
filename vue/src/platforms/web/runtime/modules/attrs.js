/* @flow */

import { isIE, isIE9, isEdge } from 'core/util/env'

import {
  extend,
  isDef,
  isUndef
} from 'shared/util'

import {
  isXlink,
  xlinkNS,
  getXlinkProp,
  isBooleanAttr,
  isEnumeratedAttr,
  isFalsyAttrValue,
  convertEnumeratedValue
} from 'web/util/index'

function updateAttrs (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  // 拿到组件VNode的组件选项信息
  const opts = vnode.componentOptions
  if (isDef(opts) && opts.Ctor.options.inheritAttrs === false) {
    // 如果组件选项配置中定义了inheritAttrs为false，直接返回
    // 即组件标签上绑定的属性不会传递到根标签上
    return
  }
  if (isUndef(oldVnode.data.attrs) && isUndef(vnode.data.attrs)) {
    // 旧VNode和新VNode都没有data.attrs，直接返回
    return
  }
  let key, cur, old
  const elm = vnode.elm //拿到VNode对应的DOM元素，如果是组件VNode，拿到的就是组件渲染出来的根节点标签
  const oldAttrs = oldVnode.data.attrs || {} //旧的attrs
  let attrs: any = vnode.data.attrs || {} //新的attrs
  // clone observed objects, as the user probably wants to mutate it
  // 如果是响应式的，克隆一份，防止用户改变它
  // 什么情况是响应式的，就是使用渲染函数时，传递的attrs
  if (isDef(attrs.__ob__)) {
    attrs = vnode.data.attrs = extend({}, attrs)
  }

  for (key in attrs) { //遍历新的attrs
    cur = attrs[key]
    old = oldAttrs[key]
    if (old !== cur) {
      // 如果新的不等于旧的
      // 在html标签上设置属性
      setAttr(elm, key, cur, vnode.data.pre)
    }
  }
  // #4391: in IE9, setting type can reset value for input[type=radio]
  // #6666: IE/Edge forces progress value down to 1 before setting a max
  // 解决IE中的bug
  /* istanbul ignore if */
  if ((isIE || isEdge) && attrs.value !== oldAttrs.value) {
    setAttr(elm, 'value', attrs.value)
  }
  for (key in oldAttrs) {//遍历旧的attrs
    if (isUndef(attrs[key])) { //如果在旧的中找不到了，说明被删掉了
      if (isXlink(key)) {
        // 移除xlink:开头的属性
        elm.removeAttributeNS(xlinkNS, getXlinkProp(key))
      } else if (!isEnumeratedAttr(key)) {
        // 移除非枚举属性
        elm.removeAttribute(key)
      }
    }
  }
}

function setAttr (el: Element, key: string, value: any, isInPre: any) {
  if (isInPre || el.tagName.indexOf('-') > -1) {
    baseSetAttr(el, key, value)
  } else if (isBooleanAttr(key)) { //如果是接收布尔类型的属性
    // set attribute for blank value
    // e.g. <option disabled>Select one</option>
    // 比如表单disabled属性 因为在html标签中不是通过true和false去控制该属性的（操作DOM就是通过true和false）
    if (isFalsyAttrValue(value)) {// 如果是假值，不会往html标签上添加该属性
      // 则直接从标签上移除该属性
      el.removeAttribute(key)
    } else {
      // technically allowfullscreen is a boolean attribute for <iframe>,
      // but Flash expects a value of "true" when used on <embed> tag
      // embed标签上使用allowfullscreen属性时，接收的值是字符形式的true
      value = key === 'allowfullscreen' && el.tagName === 'EMBED'
        ? 'true'
        : key
      el.setAttribute(key, value)
    }
  } else if (isEnumeratedAttr(key)) {//如果是枚举属性
    // 设置枚举属性的值
    el.setAttribute(key, convertEnumeratedValue(key, value))
  } else if (isXlink(key)) { //如果xlink:开头的属性
    if (isFalsyAttrValue(value)) { //如果是假值
      // 直接移除xlink:开头的属性
      el.removeAttributeNS(xlinkNS, getXlinkProp(key))
    } else {
      // 否则进行设置
      el.setAttributeNS(xlinkNS, key, value)
    }
  } else {
    baseSetAttr(el, key, value)
  }
}

function baseSetAttr (el, key, value) {
  if (isFalsyAttrValue(value)) { //如果是假值
    el.removeAttribute(key)//直接移除
  } else {
    // #7138: IE10 & 11 fires input event when setting placeholder on
    // <textarea>... block the first input event and remove the blocker
    // immediately.
    /* istanbul ignore if */
    // 解决IE的bug
    if (
      isIE && !isIE9 &&
      el.tagName === 'TEXTAREA' &&
      key === 'placeholder' && value !== '' && !el.__ieph
    ) {
      const blocker = e => {
        e.stopImmediatePropagation()
        el.removeEventListener('input', blocker)
      }
      el.addEventListener('input', blocker)
      // $flow-disable-line
      el.__ieph = true /* IE placeholder patched */
    }

    // 设置属性
    el.setAttribute(key, value)
  }
}

export default {
  create: updateAttrs,
  update: updateAttrs
}
