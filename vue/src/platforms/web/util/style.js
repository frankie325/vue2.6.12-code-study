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
// 处理静态staticStyle和v-bind绑定的style，最终合并成一个对象
function normalizeStyleData (data: VNodeData): ?Object {
  // staticStyle已经是对象了，
  // 处理v-bind绑定的style属性
  const style = normalizeStyleBinding(data.style)
  // static style is pre-processed into an object during compilation
  // and is always a fresh object, so it's safe to merge into it

  // 将staticStyle对象和style对象合并
  return data.staticStyle
    ? extend(data.staticStyle, style)
    : style
}

// normalize possible array / string values into Object
/*
处理使用v-bind指令绑定的style属性
<div :style=" 'font-size:16px'  }"></div> 可以是字符
<div :style="{ fontSize: '16px' }"></div> 可以是对象
<div :style="[ { fontSize: '16px' }, {color:'red' } ]"></div> 可以是数组，但每个元素里只能是对象
将以上形式全部转为对象
{
  fontSize:'16px'
  color:'red'
  ...
}
*/
export function normalizeStyleBinding (bindingStyle: any): ?Object {
  if (Array.isArray(bindingStyle)) { //如果是数组
    // 数组里的对象转为对象，只有一层
    return toObject(bindingStyle)
  }
  if (typeof bindingStyle === 'string') { // 如果是字符
    // 调用parseStyleText转为对象
    return parseStyleText(bindingStyle)
  }
  // 只剩对象形式，直接返回
  return bindingStyle
}

/**
 * parent component style should be after child's
 * so that parent component's style could override it
 */
/*
  合并静态staticStyle和v-bind绑定的style
  父组件样式在子组件之后进行合并，保证父组件的样式优先级更高
*/
export function getStyle (vnode: VNodeWithData, checkChild: boolean): Object {
  const res = {}
  let styleData

  if (checkChild) {
    let childNode = vnode
    while (childNode.componentInstance) { //如果是组件VNode
      childNode = childNode.componentInstance._vnode //拿到组件内创建的VNode
      if (
        childNode && childNode.data &&
        (styleData = normalizeStyleData(childNode.data)) //拿到组件根节点上的style属性
      ) {
        extend(res, styleData) //合并到res
      }
    }
  }

  if ((styleData = normalizeStyleData(vnode.data))) { //合并组件VNode的上的style
    extend(res, styleData)
  }

  let parentNode = vnode
  while ((parentNode = parentNode.parent)) { //组件根节点VNode对应的组件VNode
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) {
      // 进行合并
      extend(res, styleData)
    }
  }
  return res
}
