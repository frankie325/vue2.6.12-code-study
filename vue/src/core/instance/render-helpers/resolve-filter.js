/* @flow */

import { identity, resolveAsset } from 'core/util/index'

/**
 * Runtime helper for resolving filters
 */
// 处理过滤器
export function resolveFilter (id: string): Function {
  // 调用resolveAsset，从$options.filters中找到对应的过滤器，否则返回identity
  // identity为一个函数，调用时传递的什么参数就返回什么参数
  return resolveAsset(this.$options, 'filters', id, true) || identity
}
