/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false //表示正在使用微任务

const callbacks = []
let pending = false

// flushCallbacks会添加到浏览器任务队列中
function flushCallbacks () {
  pending = false
  // 复制一遍callbacks
  const copies = callbacks.slice(0)
  // 把 原来 callbacks 清空
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    // 遍历执行callbacks里的回调函数
    copies[i]()
  }
}

// timerFunc的作用，就是将flushCallbacks函数放入浏览器的异步任务队列中
let timerFunc
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 支持Promise
  const p = Promise.resolve()
  timerFunc = () => {
    // 将flushCallbacks放入微任务队列
    p.then(flushCallbacks)
    /**
     * 在有问题的UIWebViews中，Promise.then不会完全中断，但是它可能会陷入怪异的状态，
     * 在这种状态下，回调被推入微任务队列，但队列没有被刷新，直到浏览器需要执行其他工作，例如处理一个计时器。
     * 因此，我们可以通过添加空计时器来“强制”刷新微任务队列。
     */
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // 不支持Promise，使用MutationObserver
  let counter = 1
  // MutationObserver的回调函数会进入微任务队列
  const observer = new MutationObserver(flushCallbacks)
  // 创建一个节点
  const textNode = document.createTextNode(String(counter))
  // 观察该节点内容变化时，会执行MutationObserver传入的回调（flushCallbacks方法）
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    // 更新节点内容，触发回调
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 不支持MutationObserver，使用setImmediate，高版本IE 和 Edge 才支持
  // setImmediate其实已经是一个宏任务了，但仍然比 setTimeout 要好
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // 都不支持，只能使用setTimeout
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 向callbacks推入包装处理过的回调函数，在任务队列中调用
  callbacks.push(() => {
    if (cb) {
      // 回调存在，执行回调
      try {
        cb.call(ctx)
      } catch (e) {
        // 处理错误
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      // 回调不存在，执行_resolve(), _resolve在下面被赋值了
      _resolve(ctx)
    }
  })
  if (!pending) {
    /*
     如果 pending 为 true，则表示浏览器的任务队列中已经放入了 flushCallbacks 函数,正在等待被执行
     pending 为 false 说明事件循环已经调用了该微任务 
     执行 flushCallbacks 函数时，pending 会被再次置为 false，表示下一个 flushCallbacks 函数可以进入
     浏览器的任务队列了
     pending保证了flushCallbacks执行前，不会重复添加到任务队列
    */
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    // 当不传回调函数时且浏览器支持Promise的，返回一个Promise，
    // 可以使用this.$nextTick().then(()=>{})的形式或者await this.$nextTick()的形式
    return new Promise(resolve => {
      // 将resolve赋值给_resolve
      _resolve = resolve
    })
  }
}
