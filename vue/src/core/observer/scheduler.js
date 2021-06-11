/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = [] //存放watcher的队列
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {} //是一个对象，存放watcher.id，用来过滤watcher,当watcher已经存在,不会重复添加
let circular: { [key: number]: number } = {}
let waiting = false  //waiting为true，表示将watcher队列注册到宏微任务，任务执行完毕，才会再次置为false
let flushing = false //flushing为true，表示watcher队列正在执行更新，任务执行完毕，才会再次置为false
let index = 0  //正在执行的watcher的索引

/**
当队列执行完毕，重置状态
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
flushSchedulerQueue会通过nextTick方法添加到callbacks数组
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow() //获取当前队列执行的时间戳
  flushing = true  //将flushing置为true，表示队列正在执行
  let watcher, id
  /*
  将队列排序（升序），保证
     1、组件的更新顺序为从父级到子级，因为父组件总是在子组件之前被创建
     2、一个组件的用户 watcher（监听Watcher和computedWatcher） 在其渲染 watcher 之前被执行，因为用户 watcher 先于 渲染 watcher 创建
     3、如果一个组件在其父组件的 watcher 执行期间被销毁，则它的 watcher 可以被跳过
    排序以后在刷新队列期间新进来的 watcher 也会按顺序放入队列的合适位置
  */
  queue.sort((a, b) => a.id - b.id)

  // 遍历watcher队列，直接使用了 queue.length，动态计算队列的长度，因为在执行的时候，可能会有新的watcher推入队列
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      // 执行watcher的before方法，比如渲染Watcher传入的before调用了beforeUpdate生命周期钩子
      watcher.before()
    }
    id = watcher.id
    // 将缓存的watcherId清除，可以向队列中继续推入当前watcher
    has[id] = null
    // 执行run方法，进行更新
    watcher.run()
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      // 在开发环境中，会计算队列中，同一watcher进行更新的次数，如果大于100次会报错
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 执行完毕，重置状态
  resetSchedulerState()

  // 执行生命周期钩子
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
  queueWatcher将watcher放入watcher 队列
 */
export function queueWatcher (watcher: Watcher) {
  // 拿到watcher的id
  const id = watcher.id
  // 刚推入watcher时，has对象作的键值不存在该watcher.id，has[id] = undefined，而undefined == null所以成立
  if (has[id] == null) {
     // 缓存 watcher.id，用于判断 watcher 是否已经入队,防止重复添加
    has[id] = true
    if (!flushing) {
      // watcher队列没有执行
      // watcher直接入队
      queue.push(watcher)
    } else {
      // watcher队列正在执行
      /* 从队列末尾开始倒序选择插入的位置,即将当前 watcher 放入已排序的队列中，且队列仍是有序的
        例如：
        1.当queue队列中的watcher为[1,3,5,6,7]，当前已经执行到id为5的watcher，此时index=2，又推入新的watcher，id为1
          i > index，保证了新插入的watcher，位置一定会在当前执行的watcher后面,才能执行到插入的watcher
          queue[i].id > watcher.id，保证了新插入的watcher，插入后的未执行的部分循序仍然是升序的
          最终结果为[1,3,5,2,6,7]
      */
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }

    if (!waiting) {
      // waiting为false,说明队列执行完毕
      waiting = true
      if (process.env.NODE_ENV !== 'production' && !config.async) {
        // 如果config.async为false，则同步执行
        // 直接调用flushSchedulerQueue，一般不会走这
        flushSchedulerQueue()
        return
      }
      //调用nextTick方法，添加到callbacks数组，最终会在浏览器的任务队列中执行
      nextTick(flushSchedulerQueue)
    }
  }
}
