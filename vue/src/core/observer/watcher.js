/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */

/*
  三个地方创建了Watcher
  1.渲染Watcher：mountComponent方法中，每个组件执行$mount时，创建了一个渲染watcher实例，挂载到了vm._watcher
  渲染Watcher的id值比监听Watcher和computedWatcher的id要大,$mount时才创建了渲染Watcher
      new Watcher(vm, updateComponent, noop, {
          before: function before () {
            if (vm._isMounted && !vm._isDestroyed) {
              callHook(vm, 'beforeUpdate');
            }
          }
        }, true);

  2.监听Watcher：$watch方法创建的watcher实例
      new Watcher(vm, expOrFn, cb, options)

  3.computedWatcher：computed创建的watcher实例
      var computedWatcherOptions = { lazy: true };
      new Watcher(
              vm,
              getter || noop, 
              noop,
              computedWatcherOptions
            );
          }
*/
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;  //监听Watcher传入为true
  lazy: boolean;  //computedWatcher传入的lazy参数，为true
  sync: boolean;
  dirty: boolean;
  active: boolean; //创建watcher实例时就赋值为true
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet; 
  newDepIds: SimpleSet; 
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function, //$watch传入的观察的key("a.b.c"的形式)或者传入的函数
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean //是否是渲染watcher
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      // 将渲染watcher实例,挂载到vm._watcher
      vm._watcher = this
    }
    // 每个实例创建的所有watcher都推入到_watchers数组中
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      // 没传默认为false
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb //$watch监听的回调函数用到
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = [] //newDeps的拷贝，但数据变化时，用来进行比较
    this.newDeps = [] //访问变量时进行依赖收集，将dep实例添加进来，方法get执行完后，清空
    this.depIds = new Set() //newDepIds的拷贝，但数据变化时，用来进行比较
    this.newDepIds = new Set() //访问变量时进行依赖收集，将dep实例添加进来，方法get执行完后，清空
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    if (typeof expOrFn === 'function') {
      // expOrFn是函数
      this.getter = expOrFn
    } else {
      // $watch传入的观察的key("a.b.c"的形式)
      // this.getter在下面get中执行时，对key进行了访问，触发get，dep实例收集监听Watcher
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        // getter不存在，说明watch监控的key值，解析不了报错
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    /*
    this.lazy为true，说明是computedWatcher，先不执行this.get()，当访问计算属性时，会调用evaluate方法执行this.get
    渲染Watcher和监听Watcher则在创建时就执行了this.get()
    */
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 将当前watcher挂载到Dep.target
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 得到value值,(watch观察的值，computed的get返回的值)
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      if (this.deep) {
        //this.deep为true，递归 
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   添加dep实例，并将自己添加到dep实例中，是个双向的过程
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      // newDepIds里没有这个id
      // 将dep实例的id添加到newDepIds
      this.newDepIds.add(id)
      // 将dep实例添加到newDeps
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        //depIds里没有这个depId，才会向dep实例添加该watcher实例，防止重复添加
        dep.addSub(this)
      }
    }
  }

  /**
   * 上一次收集的dep实例，但在最新的一次更新时，没有进行收集的dep需要清除掉
   */
  cleanupDeps () {
    // 第一次创建时，deps没有值，不会循环
    let i = this.deps.length
    while (i--) {
      // 遍历deps
      const dep = this.deps[i]
      // 新收集的dep实例与旧收集的dep实例进行比较
      // 如果旧的不在新的中，说明页面没有对该变量进行访问
      if (!this.newDepIds.has(dep.id)) {
        // 将该变量收集的当前watcher移除
        dep.removeSub(this)
      }
    }
    //将newDepIds赋值给depIds，并清空newDepIds
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    //将newDeps赋值给deps，并清空newDeps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   根据 watcher 配置项，决定同步还是异步更新，一般是异步
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      // 如果this.lazy存在，说明是computedWatcher，将dirty设置为true，访问计算属性时，重新获取最新的值
      this.dirty = true
    } else if (this.sync) {
       // this.sync为true，则同步执行（在使用 vm.$watch 或者 watch 选项时可以传一个 sync 选项，官方文档没说明），
      this.run()
    } else {
      // 异步执行
      // 更新时一般都这里，将 watcher 放入 watcher 队列
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      // 重新收集依赖，并得到最新的value
      const value = this.get()
      if (
        // 新值不等于旧值
        value !== this.value ||
        // 新值为对象或数组
        isObject(value) ||
        // deep为true
        this.deep
      ) {
        const oldValue = this.value
        // this.value拿到新值
        this.value = value
        if (this.user) {
          // 只有监听Watcher的user为true，因为需要调用用户传入的回调，需要进行错误处理
          const info = `callback for watcher "${this.expression}"`
          // 进行错误处理，里面会执行回调，如果有报错，会进行错误拦截
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          // 非监听Watcher执行回调，this.cb都是noop函数
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   evaluate执行，得到value值，在计算属性中用到
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * 遍历所有dep实例，添加组件的渲染watcher，在计算属性中用到
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
