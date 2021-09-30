/* @flow */

import { namespaceMap } from 'web/util/index'

// 创建标签
export function createElement (tagName: string, vnode: VNode): Element {
  const elm = document.createElement(tagName)
  if (tagName !== 'select') {
    return elm
  }
  // false or null will remove the attribute but undefined will not
  // 对于select标签，只要multiple不是false或者null，则开启多选效果
  if (vnode.data && vnode.data.attrs && vnode.data.attrs.multiple !== undefined) {
    elm.setAttribute('multiple', 'multiple')
  }
  return elm
}

// 创建标签并设置命名空间
export function createElementNS (namespace: string, tagName: string): Element {
  return document.createElementNS(namespaceMap[namespace], tagName)
}

// 创建文本标签
export function createTextNode (text: string): Text {
  return document.createTextNode(text)
}

// 创建注释标签
export function createComment (text: string): Comment {
  return document.createComment(text)
}

// 插入到父标签内的指定标签之前
export function insertBefore (parentNode: Node, newNode: Node, referenceNode: Node) {
  parentNode.insertBefore(newNode, referenceNode)
}

// 从父标签中移除
export function removeChild (node: Node, child: Node) {
  node.removeChild(child)
}

// 添加到父标签末尾
export function appendChild (node: Node, child: Node) {
  node.appendChild(child)
}

// 获取DOM元素的父节点
export function parentNode (node: Node): ?Node {
  return node.parentNode
}

// 获取DOM元素之后紧跟的节点
export function nextSibling (node: Node): ?Node {
  return node.nextSibling
}

// 获取DOM元素的标签名
export function tagName (node: Element): string {
  return node.tagName
}

// 设置标签的文本内容
export function setTextContent (node: Node, text: string) {
  node.textContent = text
}

// 为DOM元素添加css作用域属性
export function setStyleScope (node: Element, scopeId: string) {
  node.setAttribute(scopeId, '')
}
