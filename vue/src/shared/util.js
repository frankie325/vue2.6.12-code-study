/* @flow */

// 被冻结的空对象
export const emptyObject = Object.freeze({})

// 为undefined或者null，返回true
export function isUndef (v: any): boolean %checks {
  return v === undefined || v === null
}

// 不是undefined且不是null
export function isDef (v: any): boolean %checks {
  return v !== undefined && v !== null
}

// 是否为true
export function isTrue (v: any): boolean %checks {
  return v === true
}

// 是否为false
export function isFalse (v: any): boolean %checks {
  return v === false
}

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

/**
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 * 判断typeof 值是不是为"object"(不包括null)，为数组或对象时返回true（包装对象也成立）
 */
export function isObject (obj: mixed): boolean %checks {
  return obj !== null && typeof obj === 'object'
}

/**
 * Object.prototype.toString.call(value),[object `value的类型`].
 * 返回值的类型
 */
const _toString = Object.prototype.toString

export function toRawType (value: any): string {
  return _toString.call(value).slice(8, -1)
}

/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
   严格检查是否是对象
 */
export function isPlainObject (obj: any): boolean {
  return _toString.call(obj) === '[object Object]'
}

// 是否是正则表达式
export function isRegExp (v: any): boolean {
  return _toString.call(v) === '[object RegExp]'
}

/**
  检查是不是有效的数组索引
 */
export function isValidArrayIndex (val: any): boolean {
  // 提取数字部分
  const n = parseFloat(String(val))
  // 大于0，且为整数，是有限的，则返回true
  return n >= 0 && Math.floor(n) === n && isFinite(val) //isFinite是js内置的，用于检查其参数是否是有限值
}

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

/**
 * Convert a value to a string that is actually rendered.
 */
export function toString (val: any): string {
  // 如果是undefined，null，则转为空字符
  // 如果是数组或者对象，调用JSON.stringify转为字符
  // 其他类型String转为字符
  return val == null
    ? ''
    : Array.isArray(val) || (isPlainObject(val) && val.toString === _toString)
      ? JSON.stringify(val, null, 2)
      : String(val)
}

/**
 * Convert an input value to a number for persistence.
 * If the conversion fails, return original string.
 */
// 调用parseFloat解析成数字
export function toNumber (val: string): number | string {
  const n = parseFloat(val)
  // 如果返回的是NaN，则使用原始值
  return isNaN(n) ? val : n
}

/**
利用闭包特性，将slot 和 component这两个Vue内置标签,存入到缓存map中
返回一个函数
当执行isBuiltInTag(组件名)，如果传入的组件名为slot或者component，返回true
 */
export function makeMap (
  str: string,
  expectsLowerCase?: boolean
): (key: string) => true | void {
  const map = Object.create(null)
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
}

/**
 检查是否是Vue的内置组件
 */
export const isBuiltInTag = makeMap('slot,component', true)

/**
 检查是否是Vue保留的属性
 */
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is')

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

/**
判断对象是否含有该属性
 */
const hasOwnProperty = Object.prototype.hasOwnProperty
// 判断对象是否含有该属性，不包括原型链上的属性
export function hasOwn (obj: Object | Array<*>, key: string): boolean {
  return hasOwnProperty.call(obj, key)
}

/*
  cached()函数执行，返回cachedFn函数,当下面的camelize(***)函数执行的时候，调用cachedFn(),
  如果cache中没有缓存，才会执行fn，并将结果进行缓存
  利用闭包特性，将结果缓存起来，节省函数的运行
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
/**
首字母大写
 */
export const capitalize = cached((str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
})

/**
将小驼峰转化为连字符形式,abcdEfg => abcd-efg
 */
const hyphenateRE = /\B([A-Z])/g
export const hyphenate = cached((str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
})

/**
 * Simple bind polyfill for environments that do not support it,
 * e.g., PhantomJS 1.x. Technically, we don't need this anymore
 * since native bind is now performant enough in most browsers.
 * But removing it would mean breaking code that was able to run in
 * PhantomJS 1.x, so this must be kept for backward compatibility.
 */

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

function nativeBind (fn: Function, ctx: Object): Function {
  return fn.bind(ctx)
}

// 对Function.prototype.bind方法做了兼容处理，Function.prototype.bind存在，则调用该方法，否则用自定义的polyfillBind()方法
export const bind = Function.prototype.bind
  ? nativeBind
  : polyfillBind

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

//合并对象，重复属性的直接覆盖
export function extend (to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key]
  }
  return to
}

/**
 * Merge an Array of Objects into a single Object.
 */
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

/* eslint-disable no-unused-vars */

/**
 * Perform no operation.
 * Stubbing args to make Flow happy without leaving useless transpiled code
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/).
  noop为一个空函数，为一些函数提供默认值，避免传入undefined之类的导致报错
 */
export function noop (a?: any, b?: any, c?: any) {}

/**
 * no函数总是返回false
 */
export const no = (a?: any, b?: any, c?: any) => false

/* eslint-enable no-unused-vars */

/**
 * Return the same value.
 */
// 解析特定平台的真实标签名称用到
export const identity = (_: any) => _

/**
 * Generate a string containing static keys from compiler modules.
 */
// 生成一个字符串，modules内容来自编译器compiler下的modules文件，生成的字符串为"staticClass,staticStyle"
export function genStaticKeys (modules: Array<ModuleOptions>): string {
  return modules.reduce((keys, m) => {
    // 将数组对象中的staticKeys属性，为数组，拼接起来
    return keys.concat(m.staticKeys || [])
  }, []).join(',')
}

/**
 * Check if two values are loosely equal - that is,
 * if they are plain objects, do they have the same shape?
 */
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

/**
 * Return the first index at which a loosely equal value can be
 * found in the array (if value is a plain object, the array must
 * contain an object of the same shape), or -1 if it is not present.
 */
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

/**
 * Ensure a function is called only once.
 */
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
