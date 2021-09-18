/* @flow */

/**
 * Runtime helper for rendering static trees.
 */
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
  // 否则，就渲染最新的VNode
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

/**
 * Runtime helper for v-once.
 * Effectively it means marking the node as static with a unique key.
 */
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
