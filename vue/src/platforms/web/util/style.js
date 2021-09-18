/* @flow */

import { cached, extend, toObject } from 'shared/util'

// 解析使用bind指令绑定的style属性值
export const parseStyleText = cached(function (cssText) {
  const res = {}
  // 负前瞻，查找;且后面不能是 非左圆括号和右圆括号
  // 比如color:red;background:url(www.xxx.com?a=1&amp;copy=3);
  // url中的分号不会匹配
  const listDelimiter = /;(?![^(]*\))/g
  // 匹配:和除换行符的其他字符
  const propertyDelimiter = /:(.+)/

  // <div style="color: red; background: green;"></div>为例
  // 按照;分隔成数组，['color: red','background: green']
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      // 继续按:分割 [color,red]
      const tmp = item.split(propertyDelimiter)
      /*
        长度大于1才会塞入对象
        最终生成的对象{
          color:"red",
          background:"green"
        }
      */ 
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim())
    }
  })
  // 返回该对象
  return res
})

// merge static and dynamic style data on the same vnode
function normalizeStyleData (data: VNodeData): ?Object {
  const style = normalizeStyleBinding(data.style)
  // static style is pre-processed into an object during compilation
  // and is always a fresh object, so it's safe to merge into it
  return data.staticStyle
    ? extend(data.staticStyle, style)
    : style
}

// normalize possible array / string values into Object
export function normalizeStyleBinding (bindingStyle: any): ?Object {
  if (Array.isArray(bindingStyle)) {
    return toObject(bindingStyle)
  }
  if (typeof bindingStyle === 'string') {
    return parseStyleText(bindingStyle)
  }
  return bindingStyle
}

/**
 * parent component style should be after child's
 * so that parent component's style could override it
 */
export function getStyle (vnode: VNodeWithData, checkChild: boolean): Object {
  const res = {}
  let styleData

  if (checkChild) {
    let childNode = vnode
    while (childNode.componentInstance) {
      childNode = childNode.componentInstance._vnode
      if (
        childNode && childNode.data &&
        (styleData = normalizeStyleData(childNode.data))
      ) {
        extend(res, styleData)
      }
    }
  }

  if ((styleData = normalizeStyleData(vnode.data))) {
    extend(res, styleData)
  }

  let parentNode = vnode
  while ((parentNode = parentNode.parent)) {
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) {
      extend(res, styleData)
    }
  }
  return res
}
