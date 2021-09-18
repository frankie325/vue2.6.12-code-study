/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

// 确保得到的是组件的构造函数
function ensureCtor (comp: any, base) {
  // 看方式一
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    /*
      如果是经过动态导入传入的值，会返回一个Module对象，其中default就是组件的配置选项
      Module {default: {…}, __esModule: true, Symbol(Symbol.toStringTag): 'Module'}
    */
    comp = comp.default
  }

  // 如果是对象形式，调用Vue.extend转成构造函数
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

// 异步组件加载时，显示的替换节点，为注释节点
export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  // 创建注释节点
  const node = createEmptyVNode()
  // 保留异步组件节点的原始信息
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}
/*
  import()是运行时执行，也就是说，什么时候运行到这一句代码，就会加载指定的模块
  异步组件的三种使用方式
  1.Vue.component('async-example', function (resolve, reject) {
  setTimeout(function () {
      // 向 `resolve` 回调传递组件定义
      resolve({
        template: '<div>I am async!</div>'
      })

      // 或者
      import("./my-async-component").then((value) => {
            resovle(value)
      });

      // 或者
      resovle(Vue.extend({...}))
  }, 1000)

  2.Vue.component(
      'async-webpack-example',
      // 这个动态导入会返回一个 `Promise` 对象。
      () => import('./my-async-component')
    )

  3.高级异步组件
  Vue.component(
    'async-example',
    () => ({
      // 需要加载的组件 (应该是一个 `Promise` 对象)
      component: import('./MyComponent.vue'),
      // 异步组件加载时使用的组件
      loading: LoadingComponent,
      // 加载失败时使用的组件
      error: ErrorComponent,
      // 展示加载时组件的延时时间。默认值是 200 (毫秒)
      delay: 200,
      // 如果提供了超时时间且组件加载也超时了，
      // 则使用加载失败时使用的组件。默认值是：`Infinity`
      timeout: 3000
    }
  )
    
})
*/

/*
执行流程：
当渲染时，第一次碰到异步组件，执行resolveAsyncComponent，会收集使用了该异步组件的vue实例
因为还在加载异步组件，所以会返回undefined，此时使用注释节点进行占位。当加载完毕后，
根据获取的异步组件配置转化为构造函数，添加到工厂函数的resolved属性中。并通知vue实例重新渲染，
再次调用resolveAsyncComponent时，直接获取resolved属性拿到该异步组件的构造函数

对于方式3的高级异步组件来说，多出一个步骤，就是根据delay属性去通知vue实例重新渲染
，也会再次调用resolveAsyncComponent，如果此时异步组件还在加载，那么返回的是加载组件的构造函数，
等到异步组件加载完毕才会返回异步组件的构造函数。
*/
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component> //为Vue
): Class<Component> | void {
  // 如果加载过程出错了直接，返回获取错误组件的构造函数
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }
 
  // 如果有缓存了，直接取缓存返回
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  // 当前正在渲染的vue实例
  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // 多个vue实例中可能使用了同一个异步组件
    // 为该异步组件收集当前正在渲染的vue实例，添加到owners属性中
    // already pending
    factory.owners.push(owner)
  }

  // 如果还在加载中，返回加载组件的构造函数
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    // 如果没有定义owners属性，添加owners属性
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    // vue实例销毁时，将该vue实例从owners中移除
    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))

    // 当加载组件完毕时调用，通知使用了该异步组件的vue实例重新渲染
    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        // 执行完毕后清空收集的vue实例和使用的计时器
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    // 传入的工厂函数中的resolve方法，只会执行一次
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      // 缓存得到的构造函数
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 只有异步才会调用forceRender，异步解析在 SSR 期间被填充为同步
      if (!sync) {
        // 调用forceRender，通知组件更新
        forceRender(true)
      } else {
        // 同步的话
        owners.length = 0
      }
    })

    // 传入的工厂函数中的resolve方法，执行失败时调用，只会执行一次
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        // 添加error属性，说明加载时产生了错误
        factory.error = true
        forceRender(true)
      }
    })

    // 执行传入的工厂函数
    const res = factory(resolve, reject)

    // 如果执行后是对象，那么对应方式2，和方式3
    if (isObject(res)) {
      // 如果是Promise对象，为方式2
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) { //没有缓存结果的话
          // 传入执行的resolve和reject方法
          // 也就是说当异步组件加载完毕的时候，会执行resolve方法
          res.then(resolve, reject)
        }

      //如果是component属性为Promise对象，为方式3
      } else if (isPromise(res.component)) {

        // 加载完毕的时候，会执行resolve方法
        res.component.then(resolve, reject)

        if (isDef(res.error)) {// 如果定义了失败时的组件
          // 添加errorComp属性，为失败时的异步组件构造函数
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) { //如果定义了加载时使用的组件
          // 添加loadingComp属性，为加载时的异步组件构造函数
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            // 如果delay是0ms，loading置为true，说明正在加载组件
            factory.loading = true
          } else {
            // 用户设定了delay属性
            // 那么过了这个延时，再去加载Loading组件
            timerLoading = setTimeout(() => {
              timerLoading = null //执行的时候清空自己本身
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                // 如果还没有resolved缓存且没有加载错误，也就是还在加载异步组件
                factory.loading = true// loading置为true，说明正在加载异步组件
                forceRender(false)
              }
            }, res.delay || 200) //延时默认200ms
          }
        }

        if (isDef(res.timeout)) { //如果定义了超时时间
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              // 如果到了超时时间，异步组件还没有加载完成，那么就直接调用reject报错
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    // 返回结果
    return factory.loading //还在加载
      ? factory.loadingComp //则返回加载组件构造函数
      : factory.resolved
  }
}
