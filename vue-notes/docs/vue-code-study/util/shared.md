# shared目录  
**shared目录下的工具函数**
:::tip 文件目录
/src/shared/
:::
## 常量   
定义的组件，指令，过滤器，生命周期名称的常量
```js
export const SSR_ATTR = 'data-server-rendered'

// 组件，指令，过滤器常量
export const ASSET_TYPES = [
  'component',
  'directive',
  'filter'
]

// 生命周期常量
export const LIFECYCLE_HOOKS = [
  'beforeCreate',
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeDestroy',
  'destroyed',
  'activated',
  'deactivated',
  'errorCaptured',
  'serverPrefetch'
]

```
## emptyObject
```js
// 被冻结的空对象
export const emptyObject = Object.freeze({})
```
## isUndef
```js
// 为undefined或者null，返回true
export function isUndef (v: any): boolean %checks {
  return v === undefined || v === null
}
```
## isDef
```js
// 不是undefined且不是null
export function isDef (v: any): boolean %checks {
  return v !== undefined && v !== null
}
```
## isTrue
```js
// 是否为true
export function isTrue (v: any): boolean %checks {
  return v === true
}
```
## isFalse
```js
// 是否为false
export function isFalse (v: any): boolean %checks {
  return v === false
}
```
## isPrimitive
```js
/**
 * 检查是否是原始类型.
 */
export function isPrimitive (value: any): boolean %checks {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    // $flow-disable-line
    typeof value === 'symbol' ||
    typeof value === 'boolean'
  )
}
```
## isObject
```js
/**
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 * 判断typeof 值是不是为"object"(不包括null)，为数组或对象时返回true（包装对象也成立）
 */
export function isObject (obj: mixed): boolean %checks {
  return obj !== null && typeof obj === 'object'
}
```
## toRawType  
返回值类型
```js
/**
 * Object.prototype.toString.call(value),返回的是字符串“[object `value的类型`]”.
 * 返回值的类型
 */
const _toString = Object.prototype.toString

export function toRawType (value: any): string {
  return _toString.call(value).slice(8, -1)//截取`value的类型`那部分
}

```
## isPlainObject  
严格检查是否是对象
```js
/**
   let a = new String("str")
   Object.prototype.toString.call(a)
   输出"[object String]"
   即使是包装对象，也能判断
   严格检查是否是对象
 */
export function isPlainObject (obj: any): boolean {
  return _toString.call(obj) === '[object Object]'
}
```
## isRegExp  
```js
// 是否是正则表达式
export function isRegExp (v: any): boolean {
  return _toString.call(v) === '[object RegExp]'
}
```
## isValidArrayIndex  
```js
/**
  检查是不是有效的数组索引
 */
export function isValidArrayIndex (val: any): boolean {
  // 提取数字部分
  const n = parseFloat(String(val))
  // 大于0，且为整数，是有限的，则返回true
  return n >= 0 && Math.floor(n) === n && isFinite(val) //isFinite是js内置的，用于检查其参数是否是有限值
}
```
## isPromise  
```js
// 判断传入的值是不是Promise实例
export function isPromise (val: any): boolean {
  return (
    // isDef为true，往下执行
    isDef(val) &&
    // .then和.catch是不是方法
    typeof val.then === 'function' &&
    typeof val.catch === 'function'
  )
}
```
## toString
```js
export function toString (val: any): string {
  // 如果是undefined，null，则转为空字符
  // 如果是数组或者对象，调用JSON.stringify转为字符
  // 其他类型用String强制转为字符
  return val == null
    ? ''
    : Array.isArray(val) || (isPlainObject(val) && val.toString === _toString)
      ? JSON.stringify(val, null, 2)
      : String(val)
}
```
## toNumber
```js
// 调用parseFloat解析成数字
export function toNumber (val: string): number | string {
  const n = parseFloat(val)
  // 如果返回的是NaN，则使用原始值
  return isNaN(n) ? val : n
}
```
## makeMap  
返回一个函数，用来检查传入的值是否符合某一特征
```js
/**
创建一个对象，makeMap传入的字符串分隔后保存到该对象，这些字符串具有某一特征
返回一个函数，当调用此函数时，判断传入的值是否存在于该对象
比如isBuiltInTag= makeMap('slot,component', true)，创建的对象持有内置组件名称的字符串这一特征，
则isBuiltInTag(组件名)可以判断组件名是不是内置组件名称
 */
export function makeMap (
  str: string,
  expectsLowerCase?: boolean
): (key: string) => true | void {
  // 创建一个空对象
  const map = Object.create(null)
  // 分隔成数组
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    // 以字符串作为键值保存在map对象中
    map[list[i]] = true
  }
  // 返回一个函数，用来判断传入的值是否存在map对象中
  return expectsLowerCase //expectsLowerCase为true，将传入的字符串转为小写
    ? val => map[val.toLowerCase()]
    : val => map[val]
}

```

## isBuiltInTag  
检查是否是Vue的内置组件
```js
/**
 检查是否是Vue的内置组件
 */
export const isBuiltInTag = makeMap('slot,component', true)
```
## isReservedAttribute  
检查是否是Vue保留的属性  
```js
/**
 检查是否是Vue保留的属性
 */
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is')
```

## remove
```js
/**
 移除数组里指定的元素
 */
export function remove (arr: Array<any>, item: any): Array<any> | void {
  if (arr.length) {
    // 拿到指定元素的索引
    const index = arr.indexOf(item)
    if (index > -1) {
      // 使用splice删除元素
      return arr.splice(index, 1)
    }
  }
}
```
## hasOwn   
检查对象是否含有该属性
```js
/**
检查对象是否含有该属性，不包括原型链上的属性.
 */
const hasOwnProperty = Object.prototype.hasOwnProperty
export function hasOwn (obj: Object | Array<*>, key: string): boolean {
  return hasOwnProperty.call(obj, key)
}
```
## cached  
缓存camelizeRE，capitalize，hyphenateRE方法使用过的值
```js
/*
  cached可以缓存传入的函数fn执行后的值。cached执行后返回一个cachedFn，
  执行cachedFn方法时，以传入的字符串作为key将fn的执行结果缓存到一个对象中
*/
export function cached<F: Function> (fn: F): F {
   // 创建一个空对象
  const cache = Object.create(null)
  return (function cachedFn (str: string) {
   // 获取缓存对象str属性的值
    const hit = cache[str]
    // 如果不存在,则执行fn
    return hit || (cache[str] = fn(str))
  }: any)
}
```
## camelize
将连字符转换为小驼峰
```js
/*
  转化为小驼峰，camelize会将abc-def-g转化为abcDefG
*/
const camelizeRE = /-(\w)/g
export const camelize = cached((str: string): string => {
  return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '')
})
// "adas-asd".replace(/-(\w)/g,(_,c)=> {
//   console.log(c)
//   return c ? c.toUpperCase() : ''
// } )
```
## capitalize  
转为首字母大写
```js
/*
首字母大写
 */
export const capitalize = cached((str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
})
```
## hyphenate  
将小驼峰转化为连字符
```js
/*
将小驼峰转化为连字符形式,abcdEfg => abcd-efg
 */
const hyphenateRE = /\B([A-Z])/g
export const hyphenate = cached((str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
})
```

## bind  
bind方法的兼容处理
```js
// 对Function.prototype.bind方法做了兼容处理，Function.prototype.bind存在，则调用该方法，否则用自定义的polyfillBind()方法
export const bind = Function.prototype.bind
  ? nativeBind
  : polyfillBind

function nativeBind (fn: Function, ctx: Object): Function {
  return fn.bind(ctx)
}

// 兼容处理，自定义的bind方法
function polyfillBind (fn: Function, ctx: Object): Function {
  // bind()执行返回的是boundFn方法
  function boundFn (a) {
    const l = arguments.length
    // 根据执行是传递的参数个数来决定调用方式
    // 1.没有传参 fn.call(ctx) 2.一个参数 fn.call(ctx, a) 3.大于一个参数 fn.apply(ctx, arguments)
    return l
      ? l > 1
        ? fn.apply(ctx, arguments)
        : fn.call(ctx, a)
      : fn.call(ctx)
  }

  boundFn._length = fn.length
  return boundFn
}
```
## toArray   
将伪数组转化为真数组

```js
/**
 将伪数组转化为真数组，可以传递索引，截取索引之后的值
 */
export function toArray (list: any, start?: number): Array<any> {
  // 截取的索引
  start = start || 0
  // 新数组长度，伪数组减去指定索引
  let i = list.length - start
  // 创建一个新数组
  const ret: Array<any> = new Array(i)
  // 遍历伪数组
  while (i--) {
    // 赋值给新数组
    ret[i] = list[i + start]
  }
  // 返回新数组
  return ret
}
```

## extend  
合并对象
```js
//合并对象，重复属性的直接覆盖
export function extend (to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key]
  }
  return to
}
```
## toObject
```js
// 将数组对象里的对象提取出来转化成对象，深度只有一层
export function toObject (arr: Array<any>): Object {
  const res = {}
  // 遍历数组
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      // 将数组里的对象，展开添加到res中
      extend(res, arr[i])
    }
  }
  return res
}
```
## noop   
noop为一个空函数，为一些函数提供默认值，避免传入undefined之类的导致报错
```js
export function noop (a?: any, b?: any, c?: any) {}
```
## no 
no函数执行返回false
```js
/*
 no函数总是返回false
 */
export const no = (a?: any, b?: any, c?: any) => false
```
## identity
```js
// 解析特定平台的真实标签名称用到
export const identity = (_: any) => _
```
## genStaticKeys
```js
// 生成一个字符串，modules内容来自编译器compiler下的modules文件，生成的字符串为"staticClass,staticStyle"
export function genStaticKeys (modules: Array<ModuleOptions>): string {
  return modules.reduce((keys, m) => {
    // 将数组对象中的staticKeys属性，为数组，拼接起来
    return keys.concat(m.staticKeys || [])
  }, []).join(',')
}
```
## looseEqual
```js
// 检查两个值是否大致相等，如果是对象的话继续判断他们内部的形式是否一样
export function looseEqual (a: any, b: any): boolean {
  if (a === b) return true //如果等于直接返回true
  const isObjectA = isObject(a)//是否是对象
  const isObjectB = isObject(b)
  if (isObjectA && isObjectB) {
    // 如果是对象
    try {
      const isArrayA = Array.isArray(a)
      const isArrayB = Array.isArray(b)
      if (isArrayA && isArrayB) {
        // 如果是数组
        return a.length === b.length && a.every((e, i) => { 
          // 长度相等的话，继续判断数组里的元素是否相等，递归调用
          return looseEqual(e, b[i])
        })
      } else if (a instanceof Date && b instanceof Date) {
        // 如果是日期，获取毫秒数，判断是否相等
        return a.getTime() === b.getTime()
      } else if (!isArrayA && !isArrayB) {
        // 如果不是数组，返回枚举自身属性的的数组
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        return keysA.length === keysB.length && keysA.every(key => {
          // 继续递归
          return looseEqual(a[key], b[key])
        })
      } else {
        // 以上不满足则返回false
        /* istanbul ignore next */
        return false
      }
    } catch (e) {
      /* istanbul ignore next */
      // 捕获到了错误也返回false
      return false
    }
  } else if (!isObjectA && !isObjectB) {
    // 两个值都不是对象，转为字符继续判断
    return String(a) === String(b)
  } else {
    // 否则返回false
    return false
  }
}
```
## looseIndexOf
```js
// 传递一个数组和一个值，返回该值在指定数组中的索引
export function looseIndexOf (arr: Array<mixed>, val: mixed): number {
  // 遍历该数组
  for (let i = 0; i < arr.length; i++) {
    // 判断该值是否与数组内的元素相等，如果成立，返回索引
    if (looseEqual(arr[i], val)) return i
  }
  // 否则，返回-1
  return -1
}
```
## once
```js
// 确保传入的函数只能执行一次
export function once (fn: Function): Function {
  let called = false
  return function () {
    if (!called) {
      called = true
      fn.apply(this, arguments)
    }
  }
}

```