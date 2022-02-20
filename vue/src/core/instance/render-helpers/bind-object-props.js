/* @flow */

import config from 'core/config'

import {
  warn,
  isObject,
  toObject,
  isReservedAttribute,
  camelize,
  hyphenate
} from 'core/util/index'

/**
 * Runtime helper for merging v-bind="object" into a VNode's data.
 */
/*
  当绑定的是对象和数组形式时，将渲染函数的第二个参数data进行一下处理
  v-bind="{id:'xxx',name:'xxx'}", 
  v-bind="[ { style: { color:'red' } }, { class:'header header-wrap' }]"
  如果对象内的属性与标签上绑定的属性重复了，不会进行覆盖，标签上绑定的属性优先级更高
*/
export function bindObjectProps (
  data: any,
  tag: string,
  value: any,
  asProp: boolean,
  isSync?: boolean
): VNodeData {
  if (value) {
    if (!isObject(value)) {
      // 如果不是对象，报错
      process.env.NODE_ENV !== 'production' && warn(
        'v-bind without argument expects an Object or Array value',
        this
      )
    } else {
      if (Array.isArray(value)) {
        // 如果是数组，将数组对象转化成一个对象
        value = toObject(value)
      }

      // 定义一个中间变量，下面赋值时用到
      let hash
      // 遍历转化后的数组
      for (const key in value) {
        if (
          key === 'class' ||
          key === 'style' ||
          isReservedAttribute(key)
        ) {
          // 如果是class或者style或者vue保留的属性
          // hash赋值为data，因为下面需要进行赋值操作，而class，style是直接在data上的
          hash = data
        } else {
          // 否则hash赋值data.attrs或者data.domProps
          const type = data.attrs && data.attrs.type
          hash = asProp || config.mustUseProp(tag, type, key)
          // 如果是需要作为DOM属性处理的属性，赋值为data.domProps
            ? data.domProps || (data.domProps = {})
            : data.attrs || (data.attrs = {})
        }
        const camelizedKey = camelize(key) //转为小驼峰
        const hyphenatedKey = hyphenate(key)//转为连字符

        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) {
          // 如果值还不存在，才会赋值
          hash[key] = value[key]

          // 如果存在.sync修饰符
          if (isSync) {
            const on = data.on || (data.on = {})
            // 往data.on上添加事件
            on[`update:${key}`] = function ($event) {
              value[key] = $event
            }
          }
        }
      }
    }
  }
  return data
}
