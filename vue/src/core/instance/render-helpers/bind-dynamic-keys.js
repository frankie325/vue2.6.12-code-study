/* @flow */

// helper to process dynamic keys for dynamic arguments in v-bind and v-on.
// For example, the following template:
// 处理动态属性绑定
// <div id="app" :[key]="value">
// 编译成下面的形式
// compiles to the following:
//
// _c('div', { attrs: bindDynamicKeys({ "id": "app" }, [key, value]) })

import { warn } from 'core/util/debug'

/*
处理动态属性的绑定形式
将动态属性合并到静态属性中
返回一个对象{
    attrName:attrName,
    ...
}
*/ 
export function bindDynamicKeys (baseObj: Object, values: Array<any>): Object {
  // 遍历第二个参数数组，每次i加2
  for (let i = 0; i < values.length; i += 2) {
    // 拿到key值
    const key = values[i]
    if (typeof key === 'string' && key) {
      // 如果key是字符的话，将值添加到静态属性中
      baseObj[values[i]] = values[i + 1]
    } else if (process.env.NODE_ENV !== 'production' && key !== '' && key !== null) {
      // null is a special value for explicitly removing a binding
      // 动态绑定的属性的值如果不是字符串，报错
      warn(
        `Invalid value for dynamic directive argument (expected string or null): ${key}`,
        this
      )
    }
  }
  return baseObj
}

// helper to dynamically append modifier runtime markers to event names.
// ensure only append when value is already string, otherwise it will be cast
// to string and cause the type check to miss.
export function prependModifier (value: any, symbol: string): any {
  return typeof value === 'string' ? symbol + value : value
}
