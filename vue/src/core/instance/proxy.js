/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (process.env.NODE_ENV !== 'production') {
  // 存储的特殊属性名称的映射表
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,' +
    'require' // for Webpack/Browserify
  )

  // 警告实例上不存在该属性
  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  // 警告实例属性不能以_和$符号开头
  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals. ' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  // 判断当前环境是否有Proxy是否可用
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    // 代理全局配置keyCodes
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        // 如果配置的keyCodes与上面系统定义的修饰符名称冲突了，报错
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  // 使用key in vm判断是否存在于vm实例时，进行拦截
  const hasHandler = {
    has (target, key) {
      const has = key in target //属性是否存在于vm上
      const isAllowed = allowedGlobals(key) || //是特殊属性名称
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data)) //或者以_开头的字符且不存在与$data
        // 满足上面判断isAllowed则为true
      if (!has && !isAllowed) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  // 访问vm实例上的属性时进行拦截
  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {// 如果访问的属性是字符且不存在vm上
        if (key in target.$data) warnReservedPrefix(target, key) //但是如果存在于$data中，说明是以_或者$符号开头的属性
        else warnNonPresent(target, key) //否则该属性就不存在与实例上
      }
      return target[key]
    }
  }

  initProxy = function initProxy (vm) {
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      // 根据render函数是否存在选择不同的代理
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
        // 将该代理对象挂载到_renderProxy，在执行render时会用到
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      // 如果没有Proxy，则_renderProxy就指向vm
      vm._renderProxy = vm
    }
  }
}

export { initProxy }
