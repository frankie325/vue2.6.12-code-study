# 渲染函数的定义

## createElement
::: tip 文件目录
/src/core/vdom/create-element.js
:::
```js
const SIMPLE_NORMALIZE = 1  //简单归一化
const ALWAYS_NORMALIZE = 2  //完全归一化

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
export function createElement (
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  if (Array.isArray(data) || isPrimitive(data)) {
    // 如果data参数是数组或者其他原始类型，说明用户没有传递data参数（使用渲染函数时，第二个参数可以省略_c(tag,children,normalizationType)）
    normalizationType = children //那么，normalizationType应该对应的是children的值
    children = data //children对应的是data的值
    data = undefined //data赋为undefined
  }
  if (isTrue(alwaysNormalize)) {
    // 最后一个参数为true的话，normalizationType赋值为2
    // 用户传入的render是经过render.call(vm._renderProxy, vm.$createElement)调用的
    // $createElement传递的最后一个参数为true，所以用户传入的render是使用的完全归一化处理
    normalizationType = ALWAYS_NORMALIZE
  }
  // 真正的渲染函数
  return _createElement(context, tag, data, children, normalizationType)
}
```

## _createElement
_createElement函数先是对子节点进行了:point_right:[归一化处理](./create-element.html#归一化处理)，然后作用就是生成VNode，也就是平常所说的虚拟DOM。
主要分为几种情况：
1. 平台保留标签：html标签、svg标签，直接生成VNode
2. 自定义组件标签：调用:point_right:[createComponent](./create-component.html#createcomponent)处理组件
3. 未知标签：也会生成VNode
```js
export function _createElement (
  context: Component, //当前组件的上下文
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  if (isDef(data) && isDef((data: any).__ob__)) {
    // data属性如果定义了且是响应式的
    // 报错，传递的data参数不能是经过了响应式处理的
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    // 返回一个空的VNode
    return createEmptyVNode()
  }
  // object syntax in v-bind
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  if (!tag) {
    // in case of component :is set to falsy value
    // 动态组件 is如果绑定的是false，那么tag值为false，返回空的VNode
    return createEmptyVNode()
  }
  // warn against non-primitive key
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    // data参数中的key属性如果不是原始类型，报错
    // key属性只能是字符或者是数字
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot
  // 子节点数组中如果只有一个函数时，当做默认插槽处理
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    // 添加到scopedSlots属性中
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }

  // 对子节点进行归一化处理
  if (normalizationType === ALWAYS_NORMALIZE) {
    // 完全归一化
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    // 简单归一化
    children = simpleNormalizeChildren(children)
  }
  let vnode, ns
  if (typeof tag === 'string') {
    // 标签名如果是字符串，有三种可能
    // 1.平台保留标签
    // 2.自定义组件
    // 3.未知标签
    let Ctor
    // 获取命名空间
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)

    // 1.平台保留标签
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      if (process.env.NODE_ENV !== 'production' && isDef(data) && isDef(data.nativeOn) && data.tag !== 'component') {
        // 事件修饰符.native只能在组件上使用
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      // 创建VNode
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )

    //2.自定义组件
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      // 如果data上没有pre属性，且该组件标签名能在$options.components选项中找到 ，则Ctor为该组件的构造函数或者组件的配置对象形式
      // 调用createComponent，创建组件的VNode
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
    // 3.未知标签

      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 未知或未列出的命名空间元素，在运行时检查，因为它可能会被分配一个命名空间
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // direct component options / constructor
    // 不是字符串，说明render函数第一个参数，传递的是组件选项对象，或者构造函数，或者是异步组件的工厂函数
    vnode = createComponent(tag, data, context, children)
  }

  if (Array.isArray(vnode)) {// 如果是数组
    // 直接返回（函数式组件）
    return vnode
  } else if (isDef(vnode)) { // 如果是一个VNode
    // 命名空间存在的话，给VNode设置命名空间
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    // 返回注释VNode
    return createEmptyVNode()
  }
}

// 设置命名空间
function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    // SVG的foreignObject标签使用默认命名空间
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    // 遍历子VNode
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
          // 递归设置命名空间
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
// 在插槽节点上使用像 :style 和 :class 这样的深度绑定时，必须确保父级组件重新渲染
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    // 调用traverse，收集父组件的渲染watcher
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
```

## 归一化处理

### simpleNormalizeChildren
::: tip 文件目录
/src/core/vdom/helpers/normalize-children.js
:::
简单归一化
```js
/*
当子节点数组中包含组件时，因为函数式组件可能会返回一个数组，对于这种情况只需要简单的标准化
因为函数式组件已经标准化了它的子节点，所以只会有一层深度的数组嵌套
利用 Array.prototype.concat.apply([], children)将数组扁平化
*/ 
export function simpleNormalizeChildren (children: any) {
  for (let i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      return Array.prototype.concat.apply([], children)
    }
  }
  return children
}
```

### normalizeChildren
完全归一化
```js
/*
  children属性可能是嵌套的数组形式
*/
export function normalizeChildren (children: any): ?Array<VNode> {
  return isPrimitive(children) //如果是原始类型
    ? [createTextVNode(children)] //创建文字VNode，用数组包裹
    : Array.isArray(children) //如果是数组
      ? normalizeArrayChildren(children) //调用normalizeArrayChildren
      : undefined
}

// 判断是不是文本节点
function isTextNode (node): boolean {
  return isDef(node) && isDef(node.text) && isFalse(node.isComment)
}

/*
  h("div",{},["text",["text", h("span","span1")], h("span","span2")])
  渲染函数中children参数是可以不断嵌套数组的
  normalizeArrayChildren就是将嵌套的数组扁平化，并将相邻的文本节点进行合并
*/ 
function normalizeArrayChildren (children: any, nestedIndex?: string): Array<VNode> {
  const res = []
  let i, c, lastIndex, last
  for (i = 0; i < children.length; i++) {
    // 遍历子节点
    c = children[i]
    // 如果没定义或者是布尔值，跳出当次循环
    if (isUndef(c) || typeof c === 'boolean') continue
    lastIndex = res.length - 1
    //获取res 最后一个数据，即上一个推入到res中的节点
    last = res[lastIndex]
    //  nested
    if (Array.isArray(c)) {// 如果是数组，说明children有嵌套数组
      if (c.length > 0) {
        // 递归调用normalizeArrayChildren
        // 如果数组嵌套多次，nestedIndex为_0_1_2，数字代表每层数组所在的索引
        c = normalizeArrayChildren(c, `${nestedIndex || ''}_${i}`)
        // merge adjacent text nodes
        if (isTextNode(c[0]) && isTextNode(last)) {
          // 如果数组内第一个节点与上一个节点都是文本节点，则进行合并
          res[lastIndex] = createTextVNode(last.text + (c[0]: any).text)
          // 从数组内删除掉该文本几点，已经合并了
          c.shift()
        }
        // 调用apply展开该数组，推入到res中
        res.push.apply(res, c)
      }
    } else if (isPrimitive(c)) {// 如果是原始类型，比如字符、数字之类的
      if (isTextNode(last)) {
        // merge adjacent text nodes
        // this is necessary for SSR hydration because text nodes are
        // essentially merged when rendered to HTML strings
        // 如果res最后一个节点是文本节点，则将两个文本进行合并
        res[lastIndex] = createTextVNode(last.text + c)
      } else if (c !== '') {
        // convert primitive to vnode
        // res最后一个节点不是文本节点，则将当前节点推入res
        res.push(createTextVNode(c))
      }
    } else {
      // 如果走到这，说明是普通标签的VNode节点

      if (isTextNode(c) && isTextNode(last)) {//如果是文本VNode节点
        // merge adjacent text nodes
        // 合并文本节点
        res[lastIndex] = createTextVNode(last.text + c.text)
      } else {
        // default key for nested array children (likely generated by v-for)
        if (isTrue(children._isVList) && //说明正在遍历的是v-for产生的VNode数组中的节点
          isDef(c.tag) &&
          isUndef(c.key) &&
          isDef(nestedIndex)) {
            // 为该节点添加默认的key值 __vlist_0_1__
            // 为什么要这么做？可能是因为用户传入render函数时，如果使用了_l工具函数去生成节点，但是没给节点传key属性
          c.key = `__vlist${nestedIndex}_${i}__`
        }
        res.push(c)
      }
    }
  }
  return res
}
```