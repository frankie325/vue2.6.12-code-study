/* @flow */

import VNode, { cloneVNode } from './vnode'
import { createElement } from './create-element'
import { resolveInject } from '../instance/inject'
import { normalizeChildren } from '../vdom/helpers/normalize-children'
import { resolveSlots } from '../instance/render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import { installRenderHelpers } from '../instance/render-helpers/index'

import {
  isDef,
  isTrue,
  hasOwn,
  camelize,
  emptyObject,
  validateProp
} from '../util/index'


// 生成一个对象，函数式组件没有上下文，所有的数据都存储在该对象中
export function FunctionalRenderContext (
  data: VNodeData,
  props: Object, //组件上拿到的props数据
  children: ?Array<VNode>,
  parent: Component, //父组件实例
  Ctor: Class<Component>
) {
  const options = Ctor.options //该组件的配置选项
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  let contextVm //函数式组件所在的上下文，即父组件实例
  if (hasOwn(parent, '_uid')) {
    // 如果父组件存在_uid，说明是一个vue实例
    // 创建一个对象，原型指向该父组件
    contextVm = Object.create(parent)
    // $flow-disable-line
    // _original属性也指向父组件
    contextVm._original = parent
  } else {
    // the context vm passed in is a functional context as well.
    // in this case we want to make sure we are able to get a hold to the
    // real context instance.
    // 没有_uid，说明在函数式组件中又使用函数式组件
    // 因为函数式组件会添加_original属性，无论嵌套多少个函数式组件
    // 总能找到外面的真正的vue组件实例
    contextVm = parent
    // $flow-disable-line
    parent = parent._original
  }

  /*
    <template functional>
    </template>
    单文件组件模板中使用了functional，options中会有_compiled属性
  */ 
  const isCompiled = isTrue(options._compiled)
  const needNormalization = !isCompiled

  this.data = data
  this.props = props //props选项
  this.children = children //该组件的子节点VNode
  this.parent = parent //父组件实例
  this.listeners = data.on || emptyObject //组件上注册的事件
  this.injections = resolveInject(options.inject, parent) //拿到injections选项
  // slots为一个函数，执行会返回包含所有插槽的对象
  this.slots = () => {
    if (!this.$slots) {
      // 处理scopedSlots选项
      normalizeScopedSlots(
        data.scopedSlots,
        this.$slots = resolveSlots(children, parent) //得到非具名插槽内容
      )
    }
    return this.$slots
  }
  // scopedSlots为包含作用域插槽的对象
  Object.defineProperty(this, 'scopedSlots', ({
    enumerable: true,
    get () {
      return normalizeScopedSlots(data.scopedSlots, this.slots())
    }
  }: any))

  // support for compiled functional template
  if (isCompiled) { //如果在模板上添加了functional
    // exposing $options for renderStatic()
    this.$options = options
    // pre-resolve slots for renderSlot()
    this.$slots = this.slots()
    this.$scopedSlots = normalizeScopedSlots(data.scopedSlots, this.$slots)
  }

  if (options._scopeId) { //如果style标签上存在scoped属性
    // 函数式组件使用的渲染函数
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization)
      // 渲染函数执行返回的一般是单个VNode，因为一般组件只有一个根节点，但函数式组件没这个限制
      if (vnode && !Array.isArray(vnode)) { //如果是数组说明是函数式组件的标签
        //为渲染出的单个VNode添加fnScopeId属性和fnContext属性
        vnode.fnScopeId = options._scopeId
        vnode.fnContext = parent 
      }
      return vnode
    }
  } else {
    // 函数式组件使用的渲染函数，上面设置了contextVm保证了所有函数式组件内渲染的VNode
    // 都指向同一个上下文contextVm，才能正确渲染出slot
    this._c = (a, b, c, d) => createElement(contextVm, a, b, c, d, needNormalization)
  }
}

installRenderHelpers(FunctionalRenderContext.prototype)

export function createFunctionalComponent (
  Ctor: Class<Component>,
  propsData: ?Object, 
  data: VNodeData,
  contextVm: Component, //当前组件的上下文，即父组件的实例
  children: ?Array<VNode> //子VNode
): VNode | Array<VNode> | void {
  const options = Ctor.options//组件的配置选项
  const props = {}
  const propOptions = options.props //组件的props选项
  if (isDef(propOptions)) { // 如果定义了props选项
    for (const key in propOptions) {
      // 校验props选项的值，并添加到props对象中
      props[key] = validateProp(key, propOptions, propsData || emptyObject)
    }
  } else { //如果没有定义props选项，那么组件上的属性都将作为prop
    if (isDef(data.attrs)) mergeProps(props, data.attrs)
    if (isDef(data.props)) mergeProps(props, data.props)
  }

  // 函数式组件没有上下文，即this，所以创建一个上下文，作为渲染函数的第二个参数
  const renderContext = new FunctionalRenderContext(
    data,
    props,
    children,
    contextVm,
    Ctor
  )

  // 直接执行渲染函数，得到函数式组件的所有Vnode
  const vnode = options.render.call(null, renderContext._c, renderContext)

  if (vnode instanceof VNode) {//如果只有一个根节点，vnode就是一个VNode实例
    // 克隆一个
    return cloneAndMarkFunctionalResult(vnode, data, renderContext.parent, options, renderContext)
  } else if (Array.isArray(vnode)) {//如果有多个根节点
    const vnodes = normalizeChildren(vnode) || [] //进行归一化
    const res = new Array(vnodes.length)
    for (let i = 0; i < vnodes.length; i++) { //遍历数组，进行克隆
      res[i] = cloneAndMarkFunctionalResult(vnodes[i], data, renderContext.parent, options, renderContext)
    }
    return res
  }
}

/*
 在设置 fnContext 之前先克隆节点，（例如，它来自缓存的普通插槽）
 否则如果节点被重用，fnContext 导致命名插槽本不应该匹配到，但是匹配到了
*/
function cloneAndMarkFunctionalResult (vnode, data, contextVm, options, renderContext) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  const clone = cloneVNode(vnode) 
  clone.fnContext = contextVm //添加fnContext属性
  clone.fnOptions = options  //添加dnOptions属性
  if (process.env.NODE_ENV !== 'production') {
    (clone.devtoolsMeta = clone.devtoolsMeta || {}).renderContext = renderContext
  }
  if (data.slot) { //函数式组件的data.slot会覆盖函数式组件内子vnode的data.slot
    (clone.data || (clone.data = {})).slot = data.slot
  }
  return clone
}

// 将属性都拷贝到props对象中
function mergeProps (to, from) {
  for (const key in from) {
    // key转为驼峰
    to[camelize(key)] = from[key]
  }
}
