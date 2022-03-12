/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
// patch 期间在组件 vnode 上调用内联钩子
const componentVNodeHooks = {
  // 创建组件时调用
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      // 如果组件已经创建过了且没被销毁且被keep-alive包裹
      const mountedNode: any = vnode // work around flow
      // 调用prepatch钩子
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 进入else说明为组件第一次创建，创建组件实例
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode, //组件VNode
        activeInstance  //为正在渲染的组件实例（即父组件实例），当创建该组件时，正在渲染的就为该组件了
      )
      // 为组件进行挂载，一般都是空挂载
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  // 组件更新阶段调用prepatch
  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions //新的组件选项{ Ctor, propsData, listeners, tag, children }
    const child = vnode.componentInstance = oldVnode.componentInstance //旧的组件实例
    // 调用updateChildComponent更新组件实例上的一堆属性
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  // 组件生成的标签插入到页面后执行
  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) { //如果还没执行过mounted钩子
      // 组件实例添加_isMounted属性，说明执行过mounted钩子了
      componentInstance._isMounted = true
      // 执行组件的mounted钩子
      callHook(componentInstance, 'mounted')
    }

    // 处理 keep-alive 组件的异常情况
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        // 如果包裹在keepAlive组件中，调用该组件以及该组件内的所有子组件的activated钩子
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  // 组件销毁时调用
  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode //拿到组件实例
    if (!componentInstance._isDestroyed) { //如果还没被销毁
      if (!vnode.data.keepAlive) {
        // 不在keep-alive组件内，则调用$destroy()直接销毁
        componentInstance.$destroy()
      } else {
        // 如果包裹在keepAlive组件中，销毁时调用该组件以及该组件内的所有子组件的deactivated钩子
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

// hooksToMerge = ['init', 'prepatch', 'insert' 'destroy']
const hooksToMerge = Object.keys(componentVNodeHooks)


/*
  组件的注册形式有三种
  1.使用Vue.component全局定义的组件，经过Vue.extend调用生成子类构造函数，已经合并到this.$options.components中
  2.直接在选项中定义的局部组件
  options:{
     components:{
        "comp":{ ... }
     }
  }
  3.定义的异步组件
  components:{
        "comp": function(){ setTimeout(()={...}) }
    }

*/
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    // Ctor不存在直接返回
    return
  }

  // 拿到Vue
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) {
    // 如果是对象形式，则转为子类构造函数
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') {
    // 如果还不是函数，报错，无效的组件定义形式
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  let asyncFactory
  if (isUndef(Ctor.cid)) { //只有构造函数才存在cid
    // 如果函数上不存在cid说明，是异步组件的定义方式
    asyncFactory = Ctor
    // 解析异步组件
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      // 创建一个注释节点进行占位，并保留异步组件节点的信息
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  // 节点的属性 JSON 字符串
  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 调用resolveConstructorOptions，更新组件构造函数的选项，因为基类的options可能会因为混入进行更新
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  if (isDef(data.model)) { 
    // 处理组件的上的v-model
    transformModel(Ctor.options, data)
  }

  // extract props
  // 提取出该子组件props选项在父组件对应的数据作为propsData
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  // 如果是函数是组件
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 获取事件监听器对象 data.on，组件上的自定义事件会在组件创建时会添加到vm._events中
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  // 原生事件重新赋值给data.on，在patch期间会进行处理，直接通过addEventListener添加到组件根标签上
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot
    // 如果是抽象组件（keep-alive，transition）， 抽象组件不保留任何东西，除了 props & listeners & slot
    
    // work around flow
    const slot = data.slot
    // 清空所有属性
    data = {}
    if (slot) {
      // data中只保留slot属性
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  /*
   在组件的 data 对象上设置 hook 对象，
   hook 对象增加四个属性，init、prepatch、insert、destroy，
   负责组件的创建、更新、销毁，这些方法在组件的 patch 阶段会被调用
  */
  installComponentHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag //配置选项如果定义了name属性，则使用这个name
  // 创建组件的VNode
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,//tag名称，vue-component-tagName
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children }, //组件才会有的选项
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  // 微信平台的处理，不做介绍
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

export function createComponentInstanceForVnode (
  // we know it's MountedComponentVNode but flow doesn't
  vnode: any,
  // in lifecycle state
  parent: any // 父组件实例
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true, //为组件的标识
    _parentVnode: vnode, //当前组件标签的VNode，取名为parentVNode是因为，相对于组件内的节点来说，组件标签的VNode就是父级VNode
    parent //该组件的父组件实例
  }
  // check inline-template render functions
  // 如果是内联模板
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    // 添加render函数去渲染内联模板，就不会去编译组件的模板了
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  
  // 执行组件的构造函数
  return new vnode.componentOptions.Ctor(options)
}

// 在组件的data中设置hook对象
function installComponentHooks (data: VNodeData) {
  // 获取data.hook
  const hooks = data.hook || (data.hook = {})
  // 遍历 hooksToMerge 数组，hooksToMerge = ['init', 'prepatch', 'insert' 'destroy']
  for (let i = 0; i < hooksToMerge.length; i++) {
    // key为数组中的字符
    const key = hooksToMerge[i]
    // data.hook 对象中获取 key 对应的方法
    const existing = hooks[key]
    // componentVNodeHooks 对象中 key 对象的方法
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      // 合并用户传递的 hook方法和 框架自带的 hook 方法
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

// 合并hook方法
function mergeHook (f1: any, f2: any): Function {
  // 其实就是同时调用两个方法
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  // 添加_merged属性，说明已经合并过了
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
/*
  options:{
      model:{
        prop:"value",
        event:"input"
      }
  }
  将组件选项中，model的信息，转换为data.attrs 对象的属性值 和 data.on对象上的事件
*/
function transformModel (options, data: any) {
  // 拿到配置选项中model属性中的prop，没有默认为value
  const prop = (options.model && options.model.prop) || 'value'
  // 拿到配置选项中model属性中的event，没有默认为input
  const event = (options.model && options.model.event) || 'input'

  // 将prop添加到data.attrs中，值为v-model绑定的变量值
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event] //该event在data.on中的值
  const callback = data.model.callback // v-model中事件对应的回调函数，已经由编译器生成了

  if (isDef(existing)) { //如果该事件已经存在值了
    if (
      Array.isArray(existing) //如果是数组
        ? existing.indexOf(callback) === -1 //不存在数组中
        : existing !== callback //不是数组，判断值是否相等
    ) {
      // 进行拼接
      on[event] = [callback].concat(existing)
    }
  } else {
    // 该事件不存在，则直接进行赋值
    on[event] = callback
  }
}
