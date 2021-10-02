/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

/*initMixin函数定义 Vue.prototype._init方法 */
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    // 用vm指向vue实例
    const vm: Component = this
    //每个 vue 实例都有一个唯一_uid，并且是依次递增的
    vm._uid = uid++

    // 性能测试
    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // 一个避免被发现的标志，observe会用到
    vm._isVue = true
    // merge options
    if (options && options._isComponent) {
      // 子组件初始化走这里
      /*
        initInternalComponent主要做了两件事情：
        1.指定组件$options原型，
        2.把组件依赖于父组件的props、listeners也挂载到options上，方便子组件调用。
      */
      initInternalComponent(vm, options)
    } else {
      // 根组件初始化走这里，为实例创建$options
      // 将构造函数上的options和传入的options合并成$options
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),//vm.constructor为Vue构造函数
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 对vm做代理
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
     // 初始化组件实例关系属性，比如 $parent、$children、$root、$refs 等
    initLifecycle(vm)
    /**
     * 初始化自定义事件，这里需要注意一点，所以我们在 <comp @click="handleClick" /> 上注册的事件，监听者不是父组件，
     * 而是子组件本身，也就是说事件的派发和监听者都是子组件本身，和父组件无关
     */
    initEvents(vm)
    // 解析组件的插槽信息，得到 vm.$slot，处理渲染函数，得到 vm.$createElement 方法，即 h 函数
    initRender(vm)
    // 调用 beforeCreate 钩子函数
    callHook(vm, 'beforeCreate')
    // 初始化组件的 inject 配置项，得到 result[key] = val 形式的配置对象，然后对结果数据进行响应式处理，并代理每个 key 到 vm 实例
    initInjections(vm) 
    // 数据响应式的重点，处理 props、methods、data、computed、watch
    initState(vm)
    // 解析组件配置项上的 provide 对象，将其挂载到 vm._provided 属性上
    initProvide(vm)
    // 调用 created 钩子函数
    callHook(vm, 'created')

    // 性能测试
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag) 
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果发现配置项上有 el 选项，则自动调用$mount 方法
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

// 初始化组件的选项
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 创建vm.$options，原型指向组件构造函数的options
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode // 拿到该组件标签的VNode
  opts.parent = options.parent //该组件的父组件实例
  opts._parentVnode = parentVnode //添加_parentVnode属性

  const vnodeComponentOptions = parentVnode.componentOptions //拿到该组件的组件选项
  opts.propsData = vnodeComponentOptions.propsData //父组件传递的props数据
  opts._parentListeners = vnodeComponentOptions.listeners //该组件上绑定的事件
  opts._renderChildren = vnodeComponentOptions.children //包裹在该组件标签内的VNode子节点
  opts._componentTag = vnodeComponentOptions.tag //该组件的标签名

  if (options.render) {
    // 如果存在render函数，添加到$options中
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

/**
 * @description: 解析构造函数的options，new Vue()时和new vue.extend()都会调用该方法，
vue.extend()时Ctor.super才存在，super为父级的构造函数，如果存在父类，则判断父类options是否是最新的进行更新
 * @param {Ctor} 传入的构造函数
 * @return {options} 返回解析后的options
 */
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  // Ctor.super存在，说明是Vue.extend()返回的子类
  if (Ctor.super) {
    // 递归调用
    const superOptions = resolveConstructorOptions(Ctor.super)//拿到最新的父类options
    const cachedSuperOptions = Ctor.superOptions  // 旧的父级的配置项
    if (superOptions !== cachedSuperOptions) {
      // 不相等，说明父类的配置项发生了改变，比如执行了Vue.mixin方法，构造函数的配置项为返回的新对象，对象的引用地址不一样了，就不相等了
      Ctor.superOptions = superOptions//将旧的superOptions更新到最新
      const modifiedOptions = resolveModifiedOptions(Ctor)//检查Ctor配置项是否变化（子类也可以执行Vue.mixin更新options）
      if (modifiedOptions) {
        // 如果变化了,更新子类的extendOptions
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 子类的options更新
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)//更新
      if (options.name) {
        // 更新options.components.name
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

/*
resolveModifiedOptions判断子类构造函数上的options是否更新
*/
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options//新的options
  const sealed = Ctor.sealedOptions//旧的options
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  // 返回新增的options
  return modified
}
