/* @flow */

import config from '../config'
import { warn } from './debug'
import { inBrowser, inWeex } from './env'
import { isPromise } from 'shared/util'
import { pushTarget, popTarget } from '../observer/dep'

// https://juejin.cn/post/6844903801275564039

export function handleError (err: Error, vm: any, info: string) {
  // Deactivate deps tracking while processing error handler to avoid possible infinite rendering.
  // See: https://github.com/vuejs/vuex/issues/1505
  // 处理错误处理程序时停用deps跟踪，以避免可能的无限渲染
  pushTarget()
  try {
    if (vm) {
      // 报错的实例
      let cur = vm
      while ((cur = cur.$parent)) { //括号包裹变量赋值返回赋值的结果,向上级递归
        // 递归查找当前实例的父实例，依次调用errorCaptured 方法
        const hooks = cur.$options.errorCaptured
        // errorCaptured在生命周期合并策略中处理成了数组
        if (hooks) {
          for (let i = 0; i < hooks.length; i++) {
            try {
              // 依次调用组件定义的errorCaptured方法
              const capture = hooks[i].call(cur, err, vm, info) === false
              // errorCaptured方法如果返回false，停止递归
              if (capture) return
            } catch (e) {
              // errorCaptured方法有报错时，调用globalHandleError
              globalHandleError(e, cur, 'errorCaptured hook')
            }
          }
        }
      }
    }
    globalHandleError(err, vm, info)
  } finally {
    popTarget()
  }
}

// 处理异步方法可能造成的异常
export function invokeWithErrorHandling (
  handler: Function, //传入的方法
  context: any,
  args: null | any[],
  vm: any,
  info: string
) {
  let res
  try {
    //  根据参数选择不同的handle执行方式
    res = args ? handler.apply(context, args) : handler.call(context)
    // 1 res存在
    // 2 !res._isVue如果传入值的_isVue为false时(表示不是vue实例)
    // 3 isPromise(res) 是Promise返回的实例
    // 4 !res._handled  _handle是Promise 实例的内部变量之一，默认是false，代表onFulfilled,onRejected是否被处理
    // 满足上面的条件，则进行异常捕获处理
    if (res && !res._isVue && isPromise(res) && !res._handled) {
      // 异常捕获处理
      res.catch(e => handleError(e, vm, info + ` (Promise/async)`))
      // issue #9511
      // avoid catch triggering multiple times when nested calls
      // 避免在嵌套调用时多次触发catch
      res._handled = true
    }
  } catch (e) {
    // 处理执行错误
    handleError(e, vm, info)
  }
  return res
}


// 调用全局配置的错误处理errorHandler
function globalHandleError (err, vm, info) {
  // 获取全局配置errorHandler，判断是否设置处理函数，默认undefined
  if (config.errorHandler) {
    try {
      // 执行设置的全局错误处理函数,想干啥就干啥
      return config.errorHandler.call(null, err, vm, info)
    } catch (e) {
      // 如果开发者在errorHandler函数中手动抛出同样错误信息throw err
      // 判断err信息是否相等，避免log两次
      if (e !== err) {
        logError(e, null, 'config.errorHandler')
      }
    }
  }
  // 全局配置errorHandler为undefined，常规log输出
  logError(err, vm, info)
}

// 错误输出函数
function logError (err, vm, info) {
  if (process.env.NODE_ENV !== 'production') {
    warn(`Error in ${info}: "${err.toString()}"`, vm)
  }
  /* istanbul ignore else */
  if ((inBrowser || inWeex) && typeof console !== 'undefined') {
    console.error(err)
  } else {
    throw err
  }
}
