/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

// 当前正在patch阶段的实例
export let activeInstance: any = null
// 表示是否正在调用 updateChildComponent 方法
export let isUpdatingChildComponent: boolean = false

// 设置当前正在patch阶段的实例
export function setActiveInstance(vm: Component) {
  // 保存之前patch的实例
  const prevActiveInstance = activeInstance
  // 更新为当前正在patch阶段的实例
  activeInstance = vm
  // 返回一个函数，当前实例patch阶段完成时调用
  // 这时activeInstance又往回退一次，保证了activeInstance储存的一直是正在patch阶段的实例
  return () => {
    activeInstance = prevActiveInstance
  }
}

export function initLifecycle (vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent //该组件的父组件实例

  if (parent && !options.abstract) { //该实例不是keep-alive和transition组件
    while (parent.$options.abstract && parent.$parent) {
      // 如果是这两个抽象组件，则跳过他们
      parent = parent.$parent
    }
    // 则将自己推入到父组件实例的$children属性中
    parent.$children.push(vm)
  }

  vm.$parent = parent //设置$parent为父组件实例
  vm.$root = parent ? parent.$root : vm //当前组件树的根vue实例

  vm.$children = [] //存储子组件实例
  vm.$refs = {} //存储的ref

  vm._watcher = null //实例的渲染watcher，唯一的
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false //是否执行了mounted钩子
  vm._isDestroyed = false //实例是否已经被销毁
  vm._isBeingDestroyed = false //实例是否正在被销毁
}

export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    // 当前正在patch阶段的实例
    const vm: Component = this
    const prevEl = vm.$el //拿到实例更新前挂载的DOM元素，空挂载为undefined
    const prevVnode = vm._vnode //拿到实例更新前的VNode
    // 设置当前正在patch阶段的实例
    const restoreActiveInstance = setActiveInstance(vm)
    // 将当前得到VNode添加到实例的_vnode属性上，到下次更新时，那么他就变成了更新之前的VNode
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // initial render
      // 如果prevVnode不存在，说明是首次渲染，进入patch阶段，传入$el
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      // 更新时走这，进入patch阶段
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    // 重置当前正在patch阶段的实例
    restoreActiveInstance()
    // update __vue__ reference

    if (prevEl) {
      // 清除上一个实例挂载的DOM元素的__vue__属性
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      // 给实例挂载的DOM元素添加__vue__属性，指向当前实例
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    // 如果渲染watcher存在，调用渲染Watcher的更新，也就是调用_update方法
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      //实例是否正在被销毁
      return
    }
    // 调用beforeDestroy钩子
    callHook(vm, 'beforeDestroy')
    // _isBeingDestroyed置为true表示已被销毁
    vm._isBeingDestroyed = true

    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      // 将自己从父级的$children中移除
      remove(parent.$children, vm)
    }

    if (vm._watcher) {
      // 销毁渲染Watcher
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      // 销毁所有Watcher
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // 调用 __patch__，销毁节点
    vm.__patch__(vm._vnode, null)
    // 调用destroyed钩子
    callHook(vm, 'destroyed')
    // 移除所有自定义事件
    vm.$off()
    // remove __vue__ reference
    // __vue__属性置为null，__vue__为对应的vue实例
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

// 执行$mount进行挂载时，调用
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  vm.$el = el
  if (!vm.$options.render) {//如果render不存在
    vm.$options.render = createEmptyVNode//创建一个空的注释VNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
      // 如果是不带编译版本（runtime-only）下使用template或el报警告
      // 如果是带编译版本就不会进入到这个逻辑
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        // render和template都不存在，报错
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 调用beforeMount钩子
  callHook(vm, 'beforeMount')

  // 初次渲染和后续的更新都会调用该方法
  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    // 如果是开发环境，updateComponent方法里面包含了性能测试部分
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      // 执行渲染函数
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      // 执行_update
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    // 生产环境下
    updateComponent = () => {
      // 执行_update
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 每个组件创建一个渲染Watcher，初始化时会执行updateComponent方法
  new Watcher(vm, updateComponent, noop, {
    // 组件更新时，会触发传入的before方法，执行beforeUpdate钩子
    before () {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    vm._isMounted = true//往实例上添加_isMounted属性
    callHook(vm, 'mounted')// 挂载成功调用，mounted钩子
  }
  return vm
}

// 组件更新时调用
export function updateChildComponent (
  vm: Component, //旧的组件实例
  propsData: ?Object, //新的propsData
  listeners: ?Object, //新的listeners
  parentVnode: MountedComponentVNode, //新的组件VNode
  renderChildren: ?Array<VNode> //新组件标签内的子VNode
) {
  // debugger
  // console.log(Math.random())
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots //新的data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots //旧的$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) || //新的scopedSlots非稳定的
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) || //旧的$scopedSlots非稳定的
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key) || //新$key不等于旧的$key
    (!newScopedSlots && vm.$scopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  // 来自父级的任何静态插槽子级在父级期间可能已更改
  // 更新。 动态作用域插槽也可能发生了变化。 在这种情况下，强制
  // 更新是必要的以确保正确性
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots 新的组件标签内的子节点
    vm.$options._renderChildren ||  // has old static slots 旧的组件标签内的子节点
    hasDynamicScopedSlot 
  )

  vm.$options._parentVnode = parentVnode //更新_parentVnode为新的组件VNode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render 更新$vnode为新的组件VNode

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode  //,_vnode为组件模板渲染出来的VNode树，更新_vnode.parent为新的组件VNode
  }
  vm.$options._renderChildren = renderChildren //更新_renderChildren为新的组件标签内的子节点

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject //更新$attrs
  vm.$listeners = listeners || emptyObject //更新$listeners

  // update props
  // 更新props选项
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || [] //props选项的key
    for (let i = 0; i < propKeys.length; i++) { //遍历props选项
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm) //更新props的值，并进行校验
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData //更新propsData属性
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners //旧的listeners
  vm.$options._parentListeners = listeners //更新_parentListeners属性为新的listeners
  updateComponentListeners(vm, listeners, oldListeners) //更新组件事件在_events中的值

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    // 调用resolveSlots，更新$slots
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    // 调用$forceUpdate，重新进入组件的patch过程
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

export function callHook (vm: Component, hook: string) {
  // 在执行生命周期钩子函数期间禁止依赖收集
  pushTarget()
  // 拿到选项合并之后的生命周期钩子，为数组
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    // 遍历，
    for (let i = 0, j = handlers.length; i < j; i++) {
      // 执行生命周期钩子
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  if (vm._hasHookEvent) {
    // 如果存在自定义的hook事件，执行对应生命周期的时候也会执行对应的自定义hook事件
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
