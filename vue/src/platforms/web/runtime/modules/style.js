/* @flow */

import { getStyle, normalizeStyleBinding } from 'web/util/style'
import { cached, camelize, extend, isDef, isUndef, hyphenate } from 'shared/util'

const cssVarRE = /^--/ //匹配css变量，以--开头的都是css变量
const importantRE = /\s*!important$/ //匹配0个或多个空白和以!important结尾
const setProp = (el, name, val) => {
  /* istanbul ignore if */
  if (cssVarRE.test(name)) { //如果是css变量，直接赋值
    el.style.setProperty(name, val)
  } else if (importantRE.test(val)) { //如果值里面包含!important
    // 把important从字符中剔除，样式名称转为连字符，进行设置
    el.style.setProperty(hyphenate(name), val.replace(importantRE, ''), 'important')
  } else {
    // 处理样式名称
    const normalizedName = normalize(name)
    if (Array.isArray(val)) {
      // Support values array created by autoprefixer, e.g.
      // {display: ["-webkit-box", "-ms-flexbox", "flex"]}
      // Set them one by one, and the browser will only set those it can recognize
      // 支持自动前缀样式值作为数组
      for (let i = 0, len = val.length; i < len; i++) {
        el.style[normalizedName] = val[i]
      }
    } else {
      // 直接在style上进行设置
      el.style[normalizedName] = val
    }
  }
}


/*
  不同浏览器下，DOM元素的style对象里面的值会不一样
   chrome: webkitAnimation: ""    IE浏览器：msAnimation""
  将样式名称进行处理，如果样式名称不在style对象里，则添加不同的前缀继续进行判断，
  还不在就是无效的样式名称
*/
const vendorNames = ['Webkit', 'Moz', 'ms'] //不同服务商的样式名称前缀
let emptyStyle
const normalize = cached(function (prop) {
  emptyStyle = emptyStyle || document.createElement('div').style //获取DOM元素的style对象，对象里的key是所有的css样式名称
  prop = camelize(prop)//转为驼峰，因为style对象里的属性都是驼峰写法
  if (prop !== 'filter' && (prop in emptyStyle)) {
    // 如果是style对象里的，直接返回名字
    return prop
  }

  // 如果不在style对象里，先把名称转为首字母大写
  const capName = prop.charAt(0).toUpperCase() + prop.slice(1)
  for (let i = 0; i < vendorNames.length; i++) {
    // 遍历样式名称前缀拼接到样式名称前面
    const name = vendorNames[i] + capName
    if (name in emptyStyle) {//如果存在于style对象里，则返回拼接后的名字
      return name
    }
  }
})

function updateStyle (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const data = vnode.data  //新的VNode数据
  const oldData = oldVnode.data //旧的VNode数据

  if (isUndef(data.staticStyle) && isUndef(data.style) &&
    isUndef(oldData.staticStyle) && isUndef(oldData.style)
  ) {
    // 如果都没定义staticStyle和style属性，直接返回
    return
  }

  let cur, name
  const el: any = vnode.elm
  const oldStaticStyle: any = oldData.staticStyle //旧节点上静态绑定的style
  const oldStyleBinding: any = oldData.normalizedStyle || oldData.style || {} //旧节点上v-bind绑定的style

  // if static style exists, stylebinding already merged into it when doing normalizeStyleData
  const oldStyle = oldStaticStyle || oldStyleBinding //所有旧的

  const style = normalizeStyleBinding(vnode.data.style) || {}

  // store normalized style under a different key for next diff
  // make sure to clone it if it's reactive, since the user likely wants
  // to mutate it.
  // 如果用户绑定了一个响应的对象，克隆一份，防止用户改变它
  vnode.data.normalizedStyle = isDef(style.__ob__)
    ? extend({}, style)
    : style

  //处理staticStyle和style
  const newStyle = getStyle(vnode, true)

  for (name in oldStyle) { //遍历旧的style对象
    if (isUndef(newStyle[name])) { //如果不在新的style对象中，那么说明该样式名称删除了
      setProp(el, name, '') //直接赋值为空
    }
  }
  for (name in newStyle) { //遍历新的style对象
    cur = newStyle[name]
    if (cur !== oldStyle[name]) { //如果样式值与旧的不相等，进行赋值
      // ie9 setting to null has no effect, must use empty string 
      // ie9如果设为null没有效果，将null改成空字符
      setProp(el, name, cur == null ? '' : cur)
    }
  }
}

export default {
  create: updateStyle,
  update: updateStyle
}
