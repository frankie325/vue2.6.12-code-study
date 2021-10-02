/* @flow */

import { warn, extend, isPlainObject } from 'core/util/index'

// 当绑定的事件是对象形式时，将渲染函数的第二个参数data进行一下处理
// v-on="{ mousedown: doThis, mouseup: doThat }"
export function bindObjectListeners (data: any, value: any): VNodeData {
  if (value) {
    if (!isPlainObject(value)) {
      // 如果不是严格的对象，报错
      process.env.NODE_ENV !== 'production' && warn(
        'v-on without argument expects an Object value',
        this
      )
    } else {
      // 拿到data.on
      const on = data.on = data.on ? extend({}, data.on) : {}
      // 遍历绑定的对象
      for (const key in value) {
        const existing = on[key]//获取之前存在的值，没有则为undefined
        const ours = value[key]
        // 如果已经存在，进行拼接
        on[key] = existing ? [].concat(existing, ours) : ours
      }
    }
  }
  return data
}
