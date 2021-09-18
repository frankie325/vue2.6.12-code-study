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

export function FunctionalRenderContext (
  data: VNodeData,
  props: Object,
  children: ?Array<VNode>,
  parent: Component, //父组件实例
  Ctor: Class<Component>
) {
  const options = Ctor.options //该组件的配置选项
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  let contextVm
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
    contextVm = parent
    // $flow-disable-line
    parent = parent._original
  }
  const isCompiled = isTrue(options._compiled)
  const needNormalization = !isCompiled

  this.data = data
  this.props = props
  this.children = children
  this.parent = parent
  this.listeners = data.on || emptyObject
  this.injections = resolveInject(options.inject, parent)
  this.slots = () => {
    if (!this.$slots) {
      normalizeScopedSlots(
        data.scopedSlots,
        this.$slots = resolveSlots(children, parent)
      )
    }
    return this.$slots
  }

  Object.defineProperty(this, 'scopedSlots', ({
    enumerable: true,
    get () {
      return normalizeScopedSlots(data.scopedSlots, this.slots())
    }
  }: any))

  // support for compiled functional template
  if (isCompiled) {
    // exposing $options for renderStatic()
    this.$options = options
    // pre-resolve slots for renderSlot()
    this.$slots = this.slots()
    this.$scopedSlots = normalizeScopedSlots(data.scopedSlots, this.$slots)
  }

  if (options._scopeId) {
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization)
      if (vnode && !Array.isArray(vnode)) {
        vnode.fnScopeId = options._scopeId
        vnode.fnContext = parent
      }
      return vnode
    }
  } else {
    this._c = (a, b, c, d) => createElement(contextVm, a, b, c, d, needNormalization)
  }
}

installRenderHelpers(FunctionalRenderContext.prototype)

export function createFunctionalComponent (
  Ctor: Class<Component>,
  propsData: ?Object,
  data: VNodeData,
  contextVm: Component, //当前组件的上下文，即父组件的实例
  children: ?Array<VNode>
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

  const renderContext = new FunctionalRenderContext(
    data,
    props,
    children,
    contextVm,
    Ctor
  )

  const vnode = options.render.call(null, renderContext._c, renderContext)

  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(vnode, data, renderContext.parent, options, renderContext)
  } else if (Array.isArray(vnode)) {
    const vnodes = normalizeChildren(vnode) || []
    const res = new Array(vnodes.length)
    for (let i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(vnodes[i], data, renderContext.parent, options, renderContext)
    }
    return res
  }
}

function cloneAndMarkFunctionalResult (vnode, data, contextVm, options, renderContext) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  const clone = cloneVNode(vnode)
  clone.fnContext = contextVm
  clone.fnOptions = options
  if (process.env.NODE_ENV !== 'production') {
    (clone.devtoolsMeta = clone.devtoolsMeta || {}).renderContext = renderContext
  }
  if (data.slot) {
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
