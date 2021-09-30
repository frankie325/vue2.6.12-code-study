/* @flow */

// 是异步组件的占位注释标签
export function isAsyncPlaceholder (node: VNode): boolean {
  return node.isComment && node.asyncFactory
}
