/* @flow */

import { isDef, isObject } from 'shared/util'

// 生成class属性值 为"className1 className2..."
export function genClassForVnode (vnode: VNodeWithData): string {
  let data = vnode.data
  let parentNode = vnode //vnode可能是组件VNode
  let childNode = vnode //vnode可能是组件根节点VNode
  while (isDef(childNode.componentInstance)) { //如果是组件VNode， while循环处理组件根节点又是组件的情况
    childNode = childNode.componentInstance._vnode //拿到组件内创建的VNode
    if (childNode && childNode.data) {
      // 合并组件标签上和组件根节点上的data.class属性和data.staticClass
      data = mergeClassData(childNode.data, data)
    }
  }
  while (isDef(parentNode = parentNode.parent)) { //如果是组件根节点VNode，拿到组件VNode
    if (parentNode && parentNode.data) {
      // 合并组件标签上和组件根节点上的data.class属性和data.staticClass
      data = mergeClassData(data, parentNode.data)
    }
  }
  // 上面的代码是在合并组件标签和组件根标签上的class属性
  // renderClass就是生成class属性了
  return renderClass(data.staticClass, data.class)
}

function mergeClassData (child: VNodeData, parent: VNodeData): {
  staticClass: string,
  class: any
} {
  // 合并组件VNode和组件根节点VNode上的class属性和staticClass属性
  return {
    staticClass: concat(child.staticClass, parent.staticClass), //静态的字符直接进行拼接
    class: isDef(child.class) 
      ? [child.class, parent.class]  //拼接成数组
      : parent.class
  }
}

// 
export function renderClass (
  staticClass: ?string,
  dynamicClass: any
): string {
  if (isDef(staticClass) || isDef(dynamicClass)) {
    // 将静态绑定的和v-bind绑定的class进行拼接
    return concat(staticClass, stringifyClass(dynamicClass))
  }
  /* istanbul ignore next */
  return ''
}

// 以空格拼接两个值，其中一个不存在，就不拼接
export function concat (a: ?string, b: ?string): string {
  return a ? b ? (a + ' ' + b) : a : (b || '')
}

/*
class使用v-bind绑定时
<div :class="'className'"></div>  可以是字符
<div :class="{ className: true }"></div> 可以是对象
<div :class="[ 'className', {...} , [...] ]"></div> 可以是组合形式

无论嵌套多少层，stringifyClass都会转化成 "className1 className2..."  的形式
*/
export function stringifyClass (value: any): string {
  if (Array.isArray(value)) {//如果是数组
    return stringifyArray(value)
  }
  if (isObject(value)) { //如果是对象
    return stringifyObject(value)
  }
  if (typeof value === 'string') { //如果是对象，直接返回
    return value
  }
  /* istanbul ignore next */
  return ''
}

function stringifyArray (value: Array<any>): string {
  let res = ''
  let stringified
  for (let i = 0, l = value.length; i < l; i++) {//遍历数组
    // 对数组里面每一项继续调用stringifyClass进行递归
    if (isDef(stringified = stringifyClass(value[i])) && stringified !== '') {
      if (res) res += ' '
      // 进行拼接
      res += stringified
    }
  }
  return res
}

function stringifyObject (value: Object): string {
  let res = ''
  for (const key in value) { //遍历对象
    if (value[key]) { //如果值为true的话
      if (res) res += ' '//如果res存在，拼接下空格，只有第一次不会成立
      res += key //将key进行拼接
    }
  }
  return res
}
