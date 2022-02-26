/* @flow */

export default class VNode {
  tag: string | void;
  data: VNodeData | void;
  children: ?Array<VNode>;
  text: string | void;
  elm: Node | void;
  ns: string | void;
  context: Component | void; // rendered in this component's scope
  key: string | number | void;
  componentOptions: VNodeComponentOptions | void;
  componentInstance: Component | void; // component instance
  parent: VNode | void; // component placeholder node

  // strictly internal
  raw: boolean; // contains raw HTML? (server only)
  isStatic: boolean; // hoisted static node
  isRootInsert: boolean; // necessary for enter transition check
  isComment: boolean; // empty comment placeholder?
  isCloned: boolean; // is a cloned node?
  isOnce: boolean; // is a v-once node?
  asyncFactory: Function | void; // async component factory function
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean;
  ssrContext: Object | void;
  fnContext: Component | void; // real context vm for functional nodes
  fnOptions: ?ComponentOptions; // for SSR caching
  devtoolsMeta: ?Object; // used to store functional render context for devtools
  fnScopeId: ?string; // functional scope id support

  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    this.tag = tag  //标签名
    this.data = data //VNode的属性
    this.children = children //子VNode，组件的子VNode在componentOptions属性中
    this.text = text //文本内容
    this.elm = elm // 标签VNode节点创建的DOM元素，以及组件VNode创建的实例的$el指向的DOM元素
    this.ns = undefined
    this.context = context //为VNode节点所在的组件实例
    this.fnContext = undefined //函数式组件的父组件实例
    this.fnOptions = undefined
    this.fnScopeId = undefined //函数时组件生成的VNode，会添加的css作用域属性
    this.key = data && data.key //标签上的key属性
    this.componentOptions = componentOptions //组件VNode才有的选项{ Ctor, propsData, listeners, tag, children }
    this.componentInstance = undefined //组件VNode，创建组件成功后的组件实例
    this.parent = undefined //只有组件内的根节点标签VNode才有parent属性，为组件标签的VNode
    this.raw = false
    this.isStatic = false  //是否是静态节点，（包括使用了v-once的节点，不在v-for内）
    this.isRootInsert = true 
    this.isComment = false //是否是注释节点
    this.isCloned = false //是克隆出来的VNode
    this.isOnce = false //使用了v-once的标签VNode
    this.asyncFactory = asyncFactory //异步组件的构造函数
    this.asyncMeta = undefined
    this.isAsyncPlaceholder = false
  }

  // DEPRECATED: alias for componentInstance for backwards compat.
  /* istanbul ignore next */
  get child (): Component | void {
    return this.componentInstance
  }
}

// 创建注释VNode
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode()
  node.text = text
  node.isComment = true //为注释节点
  return node
}

// 创建文本VNode
export function createTextVNode (val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
// 由于静态节点和槽节点可以在多个渲染中重用，所以克隆它们可以避免DOM操作依赖于它们的elm引用时出现错误
export function cloneVNode (vnode: VNode): VNode {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    // #7975
    // clone children array to avoid mutating original in case of cloning
    // a child.
    // 克隆子数组以避免在克隆的情况下改变原始数组
    vnode.children && vnode.children.slice(),
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
