# 渲染函数的调用位置
经过前面编译器的处理，得到的渲染函数函数添加到了```$options.render```上，静态节点渲染函数添加到了```$options.staticRenderFns ```上，这时候在回过头来看:point_right:[$mount](../compile/compile-entry.html#mount)方法中的```mountComponent```干了什么
```js
// public mount method
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 拿到el指定的DOM元素
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}
```
## mountComponent
mountComponent方法主要就是创建了渲染Watcher，在渲染Watcher里会执行传入的```updateComponent```方法，也就是```vm._update(vm._render(), hydrating)```方法，而```_update```和```_render```方法是在初始化的时候创建的
```js
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
```
## renderMixin
::: tip 文件目录
/src/core/instance/render.js
:::
先看```_render```函数，它在```renderMixin```中被定义，```renderMixin```同时也安装了渲染函数的一些工具方法和定义了```$nextTick```方法。  
```_render```函数作用就是调用模板解析得到的```$options.render```方法，得到一个VNode树
而生成VNode节点是执行```_c```方法得到的，所以真正的渲染函数是```_c```，需要知道```_c```在哪里被定义

```js
export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  // 安装渲染函数中用到的工具方法
  installRenderHelpers(Vue.prototype)

  //定义 $nextTick方法，也就是Vue.nextTick
  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    const { render, _parentVnode } = vm.$options

    if (_parentVnode) { //如果选项中存在_parentVnode属性，说明正在执行组件的渲染过程，_parentVnode为组件标签VNode
      // 将组件的作用域插槽进行处理
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode //$vnode设置为组件VNode
    // render self
    let vnode
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm  //设置当前正在执行渲染函数的实例
      // 执行render函数，生成vnode
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null 
    }
    // if the returned array contains only a single node, allow it
    if (Array.isArray(vnode) && vnode.length === 1) {
      // 如果返回的VNode是数组且只有一个元素，允许它通过，把这个元素当成根节点
      vnode = vnode[0]
    }
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      // 否则，报错，因为返回了多个根节点VNode
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      // 创建一个空的注释VNode
      vnode = createEmptyVNode()
    }
    // set parent
    vnode.parent = _parentVnode //给组件生成的VNode设置parent属性，为组件标签的VNode（注意只给根VNode设置了该属性）

    // 返回渲染出来的VNode
    return vnode
  }
}
```

### installRenderHelpers
::: tip 文件目录
/src/core/instance/render-helpers/index.js
:::
生成渲染函数时用到的工具方法，具体请看:point_right:[渲染函数用到的工具方法](./render.html#渲染函数用到的工具方法)
```js
export function installRenderHelpers (target: any) {
  // 对v-for内的v-once节点进行标记
  target._o = markOnce
  // 转化成number
  target._n = toNumber
  // 转化成字符
  target._s = toString
  // 渲染v-for
  target._l = renderList
  // 渲染slot标签
  target._t = renderSlot
  // 检查两个值是否大致相等
  target._q = looseEqual
  // 返回值在数组中的索引
  target._i = looseIndexOf
  // 渲染静态根节点
  target._m = renderStatic
  // 处理过滤器
  target._f = resolveFilter
  // 处理事件出发时的键盘修饰符
  target._k = checkKeyCodes
  // 当绑定的是对象和数组形式时，将渲染函数的第二个参数data进行一下处理
  target._b = bindObjectProps
  // 创建空文本VNode
  target._v = createTextVNode
  // 创建空注释VNode
  target._e = createEmptyVNode
  // 处理组件VNode上的ScopedSlots属性
  target._u = resolveScopedSlots
  // 当绑定的事件是对象形式时，将渲染函数的第二个参数data进行一下处理
  target._g = bindObjectListeners
  // 处理动态绑定的属性
  target._d = bindDynamicKeys
  // 处理动态绑定事件，且带有.capture、.once、.passive修饰符
  target._p = prependModifier
}

```
### _render
_render内执行由编译阶段得到的渲染函数，生成vue实例的VNode树节点
### normalizeScopedSlots
生成$scopedSlots属性
```js
/*
  normalizeScopedSlots函数用来生成$scopedSlots的内容
  $scopedSlots内包含了具名插槽和非具名插槽，如果slotTarget重复了，以具名插槽优先
  生成的$scopedSlots
  {
    slotTarget1:function normalized(){...}, //执行返回插槽节点的VNode
    slotTarget2:()=>{}  //执行返回非具名插槽节点的VNode
    ...
    $stable: false //是否稳定
    $hasNormal: true //是否有非具名插槽内容
    $key: undefined //唯一的hash值
  }
*/
export function normalizeScopedSlots (
  slots: { [key: string]: Function } | void, //最新的scopedSlots
  normalSlots: { [key: string]: Array<VNode> },// $slots，非具名插槽内容
  prevSlots?: { [key: string]: Function } | void //组件更新前的$scopedSlots
): any {
  let res
  const hasNormalSlots = Object.keys(normalSlots).length > 0 //是否存在$slots
  const isStable = slots ? !!slots.$stable : !hasNormalSlots //是否稳定，为true就不要强制更新了
  const key = slots && slots.$key 
  if (!slots) {
    res = {}
  } else if (slots._normalized) {
    // 如果是父组件更新了，传进的最新的scopedSlots会是一个新的对象，没有_normalized属性
    // 所以当还存在_normalized，说明只有子组件更新了，因为父组件没更新，插槽内容也就没有更新，获取之前的缓存就行
    // fast path 1: child component re-render only, parent did not change
    return slots._normalized
  } else if (
    isStable && //稳定的
    prevSlots && 
    prevSlots !== emptyObject && //之前的$scopedSlots内容不为空
    key === prevSlots.$key && //key没变化，即插槽内容没有变化
    !hasNormalSlots && //没有$slot普通插槽内容
    !prevSlots.$hasNormal
  ) {
    // fast path 2: stable scoped slots w/ no normal slots to proxy,
    // only need to normalize once
    // 对于稳定的插槽节点
    // 则使用之前的$scopedSlots
    return prevSlots
  } else {
    // 走到这里就需要更新插槽节点内容了
    res = {}
    for (const key in slots) { //遍历最新的scopedSlots内容
      if (slots[key] && key[0] !== '$') {
        // 调用normalizeScopedSlot得到一个函数，执行时可以的到插槽节点的VNode
        res[key] = normalizeScopedSlot(normalSlots, key, slots[key])
      }
    }
  }
  // expose normal slots on scopedSlots
  // 暴露非具名插槽到$scopedSlots
  for (const key in normalSlots) { //遍历$slot
    if (!(key in res)) { //如果不在res，也添加到res中，所以如果slotTarget重复了，以具名插槽优先
      res[key] = proxyNormalSlot(normalSlots, key) //为一个函数，执行时返回对应的VNode
    }
  }
  // avoriaz seems to mock a non-extensible $scopedSlots object
  // and when that is passed down this would cause an error
  if (slots && Object.isExtensible(slots)) {
    // 将结果缓存
    (slots: any)._normalized = res
  }

  // 往res添加下列属性，不可遍历
  def(res, '$stable', isStable)
  def(res, '$key', key)
  def(res, '$hasNormal', hasNormalSlots)
  return res
}

// 归一化处理插槽的VNode
function normalizeScopedSlot(normalSlots, key, fn) {
  const normalized = function () {
    // 执行fn得到插槽节点的VNode
    let res = arguments.length ? fn.apply(null, arguments) : fn({})
    res = res && typeof res === 'object' && !Array.isArray(res)
      ? [res] // single vnode //单个VNode
      : normalizeChildren(res) //多个VNode需要进行归一化
    let vnode: VNode = res && res[0]

    // 返回的到的VNode
    return res && (
      !vnode ||
      (vnode.isComment && !isAsyncPlaceholder(vnode)) // #9658, #10391
    ) ? undefined
      : res
  }
  // this is a slot using the new v-slot syntax without scope. although it is
  // compiled as a scoped slot, render fn users would expect it to be present
  // on this.$slots because the usage is semantically a normal slot.
  /*
    这是一个使用没有作用域的新 v-slot 语法的插槽。 虽然它是
    编译为作用域插槽 用户希望它存在
    在 this.$slots 上，因为用法在语义上是一个普通的插槽
  */
  if (fn.proxy) {
    Object.defineProperty(normalSlots, key, {
      get: normalized,
      enumerable: true,
      configurable: true
    })
  }
  // 返回该函数
  return normalized
}

// 返回一个函数，执行时返回$slots中对应的VNode
function proxyNormalSlot(slots, key) {
  return () => slots[key]
}
```
## initRender
vue实例初始化的时候调用了该方法  
```initRender```方法中定义了```$slots、$scopedSlots、_c、$createElement、$attrs、$listeners```
```js
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree  组件VNode
  const renderContext = parentVnode && parentVnode.context //父组件实例

  // $slots对象里是非具名插槽节点
  vm.$slots = resolveSlots(options._renderChildren, renderContext)//_renderChildren为包裹在该组件标签内的VNode子节点
  vm.$scopedSlots = emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // 添加_c渲染函数，执行_c的时候，调用createElement函数，作用是添加渲染上下文，即vm
  // 模板编译，调用的是_c渲染函数
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // 用户使用render函数时，调用的是$createElement渲染函数
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data //组件VNode的data属性

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    // 定义$attrs，即组件VNode上的data.attrs，且不可修改，是只读的
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    // 定义$listeners，即组件VNode上的data.on，且不可修改，是只读的
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}
```
### $slots
在组件初始化的时候便可以拿到组件标签包裹的子VNode节点。生成```$slots```属性，为非具名插槽VNode节点
```js
/*
 在生成AST的阶段，具名插槽标签节点（使用了slotScope属性和v-slot指令）是不会添加到组件AST的children属性中
 只使用了slot属性的标签和普通标签才会推入到children中
*/

/*
  将组件标签内的非具名插槽子节点，添加到组件实例的$slot中
  最终返回一个对象
  $slots = {
      default:[VNode,VNode...],
      slotName:[VNode,VNode...]
  }
*/
export function resolveSlots (
  children: ?Array<VNode>, //该组件的子节点VNode
  context: ?Component //该组件的父组件实例
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) {
    return {}
  }
  const slots = {}
  // 遍历子组件VNode
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    // 如果节点被解析为 Vue slot 节点，则移除 slot 属性
    // 因为非template标签只是用了slot属性的话，会往attrs添加slot属性，作为原生html的slot属性
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    // 组件的子节点所在父组件实例需要和组件所在的父组件实例一样
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {
      const name = data.slot//slot属性值
      const slot = (slots[name] || (slots[name] = []))
      
      if (child.tag === 'template') {// 如果子节点是template标签
        // 将template内的VNode节点推入到slot中
        slot.push.apply(slot, child.children || [])
      } else {
        // 否则直接将子节点VNode推入
        slot.push(child)
      }
    } else {
      // 不存在slot属性，则作为默认插槽内容
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  for (const name in slots) {
    // 如果插槽内容节点内都是注释VNode或者空文本VNode
    if (slots[name].every(isWhitespace)) {
      // 则删除该插槽内容
      delete slots[name]
    }
  }
  return slots
}

// 是注释文本节点但不是函数组件的替换注释文本  或者是空文本节点，返回true
function isWhitespace (node: VNode): boolean {
  return (node.isComment && !node.asyncFactory) || node.text === ' '
}
```
### $scopedSlots
初始$scopedSlots为一个空对象，在```_render```函数内执行:point_right:[normalizeScopedSlots](./render.html#normalizescopedslots)函数生成$scopedSlots属性
### _c、$createElement
渲染函数的创建，经过了:point_right:[createElement](./create-element.html#createelement)函数的柯里化处理，得到两种稍有区别的渲染函数_c和$createElement
- _c：经过模板编译，调用的是_c渲染函数
- $createElement：用户使用render选项时，传递的第一个参数便是$createElement
  
**区别就在于，$createElement对于子节点的处理使用完全归一化处理，而_c会根据编译结果去选择不同的归一化处理**
### $attrs
定义```$attrs```，开发环境是只读的，为组件VNode上的data.attrs，即绑定在组件标签上的属性。**注意：作为props传递的属性和style，class属性不会添加到data.attrs中**
### $listeners
定义```$listeners```，开发环境是只读的，为组件VNode上的data.on，即绑定在组件上的自定义事件，在组件中通过```$emit```触发。**注意：有native修饰符的事件不会添加到data.on中**


## 渲染函数用到的工具方法

### _o，（markOnce）
::: tip 文件目录
/src/core/instance/render-helpers/render-static.js
:::
v-for内的v-once标签节点，会为该VNode添加isOnce属性，在patch更新阶段，跳过该VNode的更新
```js
/*
  v-for内的v-once标签会调用markOnce
*/
export function markOnce (
  tree: VNode | Array<VNode>, 
  index: number, //onceId
  key: string  //v-for标签的key属性
) {
  // __once__onceId_key
  markStatic(tree, `__once__${index}${key ? `_${key}` : ``}`, true)
  return tree
}

function markStatic (
  tree: VNode | Array<VNode>,
  key: string,
  isOnce: boolean
) {
  // 如果是数组，说明v-once指令在v-for标签上
  if (Array.isArray(tree)) {
    // 遍历VNode节点
    for (let i = 0; i < tree.length; i++) {
      if (tree[i] && typeof tree[i] !== 'string') {
        // 标记为静态VNode节点
        markStaticNode(tree[i], `${key}_${i}`, isOnce)
      }
    }
  } else {
    markStaticNode(tree, key, isOnce)
  }
}

// 标记为静态VNode节点
function markStaticNode (node, key, isOnce) {
  node.isStatic = true //isStatic属性设为true，说明为静态节点
  node.key = key  //__once__onceId_key_index
  node.isOnce = isOnce //isOnce属性设为true
}
```

### _n，（toNumber）
:point_right:[toNumber](../util/shared.html#tonumber)
### _s，（toString）
:point_right:[toString](../util/shared.html#tostring)
### _l，（renderList）
::: tip 文件目录
/src/core/instance/render-helpers/render-list.js
:::
```js
// 渲染v-for循环的节点，返回一个VNode数组
export function renderList (
  val: any, //v-for循环的值
  render: (
    val: any,
    keyOrIndex: string | number,
    index?: number
  ) => VNode
): ?Array<VNode> {

  let ret: ?Array<VNode>, i, l, keys, key
  if (Array.isArray(val) || typeof val === 'string') {
    // 1.如果是对象或者是字符
    ret = new Array(val.length)
    // 进行遍历
    for (i = 0, l = val.length; i < l; i++) {
      // 调用第二个参数
      // 生成VNode数组
      ret[i] = render(val[i], i) //值，索引
    }
  } else if (typeof val === 'number') {
    // 2.如果是数字
    ret = new Array(val) //生成以该数字为长度的数组
    // 遍历
    for (i = 0; i < val; i++) {
      ret[i] = render(i + 1, i) //数值，索引
    }
  } else if (isObject(val)) {
    // 3.如果是对象且是可迭代对象，比如Set，Map类型，arguments参数
    if (hasSymbol && val[Symbol.iterator]) {
      ret = []
      // 直接调用迭代器去遍历该对象
      const iterator: Iterator<any> = val[Symbol.iterator]()
      let result = iterator.next()
      while (!result.done) {
        ret.push(render(result.value, ret.length))
        result = iterator.next()
      }
    } else {
      // 不是可迭代对象，则调用Object.keys去遍历
      keys = Object.keys(val)
      ret = new Array(keys.length)
      // 遍历
      for (i = 0, l = keys.length; i < l; i++) {
        key = keys[i]
        ret[i] = render(val[key], key, i) //对象值，对象key，索引
      }
    }
  }
  if (!isDef(ret)) {
    // 没有，则为空数组
    ret = []
  }
  // 为该VNode数组添加_isVList属性，说明是v-for循环的节点
  (ret: any)._isVList = true
  return ret
}
```
### _t，（renderSlot）
```js
/*
  根据slot标签的name属性，找到$scopedSlots中对应的方法，得到VNode
*/
export function renderSlot (
  name: string, //slot标签的name属性
  fallbackRender: ?((() => Array<VNode>) | Array<VNode>), //slot标签内的子标签的渲染函数
  props: ?Object, //slot标签上的属性
  bindObject: ?Object //slot标签上v-bind绑定的对象形式值
): ?Array<VNode> {
  // 拿到name属性在$scopedSlots中的方法
  const scopedSlotFn = this.$scopedSlots[name]
  let nodes
  if (scopedSlotFn) { //如果该方法存在
    // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        // 不带参数的v-bind绑定的值，需要是对象类型
        warn('slot v-bind without argument expects an Object', this)
      }
      // 进slot标签上绑定的属性合并到一个对象中
      props = extend(extend({}, bindObject), props)
    }
    nodes =
      scopedSlotFn(props) || //执行scopedSlotFn
      (fallbackRender && //scopedSlotFn如果为返回VNode，则调用fallbackRender，返回slot标签内的VNode
        (Array.isArray(fallbackRender) ? fallbackRender : fallbackRender()))
  } else {
    // scopedSlotFn方法不存在，则在$slots中去找
    nodes =
      this.$slots[name] ||
      (fallbackRender &&
        (Array.isArray(fallbackRender) ? fallbackRender : fallbackRender()))
  }

  // 如果slot标签上还存在slot属性
  const target = props && props.slot
  if (target) {
    // 则将渲染出来的插槽内容再包一层template标签，并添加slot属性
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
```

### _q，（looseEqual）
:point_right:[looseEqual](../util/shared.html#looseequal)
### _i，（looseIndexOf）
:point_right:[looseIndexOf](../util/shared.html#looseindexof)
### _m，（renderStatic）
::: tip 文件目录
/src/core/instance/render-helpers/render-static.js
:::
**静态节点和使用了v-once的标签节点会调用该方法**   

对于没有使用vue语法的标签，即静态节点，会缓存它的VNode，下次刷新的时候，直接拿到缓存中的VNode节点，
在diff算法的过程中，就会跳过该静态节点
```js
//渲染静态根节点
export function renderStatic (
  index: number,
  isInFor: boolean
): VNode | Array<VNode> {

  // 静态节点缓存到实例的_staticTrees属性中
  const cached = this._staticTrees || (this._staticTrees = [])
  // 拿到缓存的VNode节点
  let tree = cached[index]
  // if has already-rendered static tree and not inside v-for,
  // we can reuse the same tree.
  // 如果已经渲染了静态树并且不在 v-for 中，我们可以重用同一棵树
  if (tree && !isInFor) {
    return tree
  }
  // otherwise, render a fresh tree.
  // 否则，就渲染最新的VNode，并进行缓存
  // 从staticRenderFns中取出对应的节点执行，得到VNode
  tree = cached[index] = this.$options.staticRenderFns[index].call(
    this._renderProxy,
    null,
    this // for render fns generated for functional component templates
    // 用于为功能组件模板生成的渲染fns
  )

  // 标记为静态VNode
  // __static__index
  markStatic(tree, `__static__${index}`, false)
  return tree
}
```
### _f，（resolveFilter）
::: tip 文件目录
/src/core/instance/render-helpers/resolve-filter.js
:::
编译阶段处理过滤器时生成的字符``` _f('filterMethod')(_f('filterMethod')(arg1,arg2))```，对于嵌套使用的过滤器，第一个过滤器的值作为第二个过滤器的第一个参数传递
```js
/**
 * Runtime helper for resolving filters
 */
// 处理过滤器
export function resolveFilter (id: string): Function {
  // 调用resolveAsset，从$options.filters中找到对应的过滤器，否则返回identity
  // identity为一个函数，调用时传递的什么参数就返回什么参数
  return resolveAsset(this.$options, 'filters', id, true) || identity
}
```

### _k，（checkKeyCodes）
::: tip 文件目录
/src/core/instance/render-helpers/check-keycodes.js
:::
绑定事件时使用了键盘修饰符，比较事件触发时，按下的按键是否与修饰符指定的按键一致。
```js
// 判断事件触发时的键盘按键是否与键盘按键修饰符一致
export function checkKeyCodes (
  eventKeyCode: number,  //事件触发时的keyCode
  key: string, //用户写的键盘修饰符
  builtInKeyCode?: number | Array<number>,//用户写的键盘修饰符对应的keyCode
  eventKeyName?: string, //事件触发时的keyName
  builtInKeyName?: string | Array<string> //用户写的键盘修饰符对应的keyName
): ?boolean {
  // 拿到用户在全局定义的键盘修饰符的keyCode别名，没有就用默认的
  const mappedKeyCode = config.keyCodes[key] || builtInKeyCode
  if (builtInKeyName && eventKeyName && !config.keyCodes[key]) {
    // 如果两者都存在keyName，直接用keyName去判断是否相等
    return isKeyNotMatch(builtInKeyName, eventKeyName)
  } else if (mappedKeyCode) {
    // keyName不存在，如果两者都存在keyCode，用keyCode去判断是否相等
    return isKeyNotMatch(mappedKeyCode, eventKeyCode)
  } else if (eventKeyName) {
    // 如果只有事件触发时的keyName，则转为连字符后判断是否等于键盘修饰符
    return hyphenate(eventKeyName) !== key
  }
  // 都不成立，看是不是undefined，是undefined，会终止事件执行
  return eventKeyCode === undefined
}

function isKeyNotMatch<T> (expect: T | Array<T>, actual: T): boolean {
  if (Array.isArray(expect)) {
    // 如果是数组，判断事件触发时的keyName是否存在于用户写的键盘修饰符对应的keyName
    // 不存在，条件成立，终止事件执行
    return expect.indexOf(actual) === -1
  } else {
    // 不是数组，直接判断是否不等于
    // 不相等，条件成立，终止事件执行
    return expect !== actual
  }
}
```
### _b，（bindObjectProps）
::: tip 文件目录
/src/core/instance/render-helpers/bind-object-props.js
:::
```js
/*
  当绑定的是对象和数组形式时，将渲染函数的第二个参数data进行一下处理
  v-bind="{id:'xxx',name:'xxx'}", 
  v-bind="[ { style: { color:'red' } }, { class:'header header-wrap' }]"
  如果对象内的属性与标签上绑定的属性重复了，不会进行覆盖，标签上绑定的属性优先级更高
*/
export function bindObjectProps (
  data: any,
  tag: string,
  value: any,
  asProp: boolean,
  isSync?: boolean
): VNodeData {
  if (value) {
    if (!isObject(value)) {
      // 如果不是对象，报错
      process.env.NODE_ENV !== 'production' && warn(
        'v-bind without argument expects an Object or Array value',
        this
      )
    } else {
      if (Array.isArray(value)) {
        // 如果是数组，将数组对象转化成一个对象
        value = toObject(value)
      }

      // 定义一个中间变量，下面赋值时用到
      let hash
      // 遍历转化后的数组
      for (const key in value) {
        if (
          key === 'class' ||
          key === 'style' ||
          isReservedAttribute(key)
        ) {
          // 如果是class或者style或者vue保留的属性
          // hash赋值为data，因为下面需要进行赋值操作，而class，style是直接在data上的
          hash = data
        } else {
          // 否则hash赋值data.attrs或者data.domProps
          const type = data.attrs && data.attrs.type
          hash = asProp || config.mustUseProp(tag, type, key)
          // 如果是需要作为DOM属性处理的属性，赋值为data.domProps
            ? data.domProps || (data.domProps = {})
            : data.attrs || (data.attrs = {})
        }
        const camelizedKey = camelize(key) //转为小驼峰
        const hyphenatedKey = hyphenate(key)//转为连字符

        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) {
          // 如果值还不存在，才会赋值
          hash[key] = value[key]

          // 如果存在.sync修饰符
          if (isSync) {
            const on = data.on || (data.on = {})
            // 往data.on上添加事件
            on[`update:${key}`] = function ($event) {
              value[key] = $event
            }
          }
        }
      }
    }
  }
  return data
}
```
### _v，（createTextVNode）
### _e，（createEmptyVNode）
### _u，（resolveScopedSlots）
::: tip 文件目录
/src/core/instance/render-helpers/resolve-scoped-slots.js
:::
```js
/*
处理组件VNode上的ScopedSlots属性
生成如下对象
 {
   $stable:true, //是否需要强制更新插槽内容，true为不要
   slotTarget: function ({ msg }) {
            // 使用了v-if，会包一层三目运算符
            return showCenter
              ? _c("div", data, children, normalizationType)
              : undefined;
            },
   slotTarget: function (){},
   ...
   $key: "xxx"//根据插槽内容生成的唯一的hash值，插槽内容变化了，hash值也会跟着变化
 }
 在组件创建的时候会根据该选项生成$scopedSlots
*/ 
export function resolveScopedSlots (
  fns: ScopedSlotsData, // see flow/vnode
  res?: Object,
  // the following are added in 2.6
  hasDynamicKeys?: boolean,
  contentHashKey?: number
): { [key: string]: Function, $stable: boolean } {
  res = res || { $stable: !hasDynamicKeys } 
  for (let i = 0; i < fns.length; i++) { //遍历scopedSlots数据
    const slot = fns[i] 
    if (Array.isArray(slot)) { //如果是数组，继续递归处理
      resolveScopedSlots(slot, res, hasDynamicKeys)
    } else if (slot) {
      // marker for reverse proxying v-slot without scope on this.$slots
      if (slot.proxy) {
        // 如果proxy为true
        slot.fn.proxy = true//往fn上添加proxy属性
      }
      // 将fn添加到res上
      res[slot.key] = slot.fn
    }
  }
  if (contentHashKey) { //hash值如果存在，添加到$key属性上
    (res: any).$key = contentHashKey
  }
  return res
}
```
### _g，（bindObjectListeners）
::: tip 文件目录
/src/core/instance/render-helpers/bind-object-listeners.js
:::
```js
// 当绑定的事件是对象形式时，将渲染函数的第二个参数data进行一下处理
// v-on="{ mousedown: doThis, mouseup: doThat }"
export function bindObjectListeners (data: any, value: any): VNodeData {
  if (value) {
    if (!isPlainObject(value)) {
      // 如果不是严格的对象，报错
      process.env.NODE_ENV !== 'production' && warn(
        'v-on without argument expects an Object value',
        this
      )
    } else {
      // 拿到data.on
      const on = data.on = data.on ? extend({}, data.on) : {}
      // 遍历绑定的对象
      for (const key in value) {
        const existing = on[key]//获取之前存在的值，没有则为undefined
        const ours = value[key]
        // 如果已经存在，进行拼接
        on[key] = existing ? [].concat(existing, ours) : ours
      }
    }
  }
  return data
}
```

### _d，（bindDynamicKeys）
::: tip 文件目录
/src/core/instance/render-helpers/bind-dynamic-keys.js
:::
```js

/*
处理动态属性绑定
<div id="app" :[key]="value">
编译成下面的形式
compiles to the following:
_c('div', { attrs: bindDynamicKeys({ "id": "app" }, [key, value]) })


将动态属性合并到静态属性中
返回一个对象{
    attrName:attrName,
    ...
}
*/ 
export function bindDynamicKeys (baseObj: Object, values: Array<any>): Object {
  // 遍历第二个参数数组，每次i加2
  for (let i = 0; i < values.length; i += 2) {
    // 拿到key值
    const key = values[i]
    if (typeof key === 'string' && key) {
      // 如果key是字符的话，将值添加到静态属性中
      baseObj[values[i]] = values[i + 1]
    } else if (process.env.NODE_ENV !== 'production' && key !== '' && key !== null) {
      // null is a special value for explicitly removing a binding
      // 动态绑定的属性的值如果不是字符串，报错
      warn(
        `Invalid value for dynamic directive argument (expected string or null): ${key}`,
        this
      )
    }
  }
  return baseObj
}
```
### _p，（prependModifier）
::: tip 文件目录
/src/core/instance/render-helpers/bind-dynamic-keys.js
:::
```js
/*
  如果是动态绑定事件，且带有.capture、.once、.passive修饰符的
  data.on:{ 
    _p(eventName,!):function($event){...}
  }
  键会包一层_p()
  prependModifier会根据对应的修饰符拼接不同的字符
  capture => !eventName
  once    => ~eventName
  passive => &eventName
*/
export function prependModifier (value: any, symbol: string): any {
  // 如果绑定的事件名为字符，返回!eventName
  return typeof value === 'string' ? symbol + value : value
}
```

## lifecycleMixin
```js
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
```
### _update

### $forceUpdate

### $destroy