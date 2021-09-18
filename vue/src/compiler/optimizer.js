/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

/*
   genStaticKeysCached("staticClass,staticStyle")
   cached会返回一个函数cachedFn，该函数执行，也就是执行genStaticKeysCached("staticClass,staticStyle")
   会调用genStaticKeys方法并缓存执行结果，
   genStaticKeys方法执行又会会返回makeMap的执行结果，保存在如下面的对象中
   cache:{
     "staticClass,staticStyle" : (str)=>{ return map[str] }
   }
   而map对象为makeMap执行时创建，作用就是isStatic方法判断时，如果AST中的全部属性都存于与map对象中，说明该节点是静态节点
   map:{
     type:true,
     tag:true,
     ...
     staticClass:true,
     staticStyle:true,
   }
   isStaticKey就是(str)=>{ return map[str] }该函数
*/
const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.

优化器的目标：遍历生成的模板 AST 树并检测纯静态的子树，即永远不需要更改的 DOM 部分
一旦我们检测到这些子树，我们就可以：

1.将它们提升为常量，这样我们就不再需要在每次重新渲染时为它们创建新节点；
2.在patch的过程中完全跳过它们。
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  // 一个方法，判断是不是静态节点
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  // 是不是平台保留标签
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 标记静态根节点
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  // 返回一个函数，判断传入的字符存不存在于下面的字符列表中
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}


// 标记静态节点
function markStatic (node: ASTNode) {
  // 调用isStatic判断该节点是不是静态节点
  node.static = isStatic(node)
  if (node.type === 1) {
  // 类型为1的标签AST对象进入该条件

    // 不要将组件的插槽内容设置为静态节点，这样可以避免：
    // do not make component slot content static. this avoids
    // 1.组件不能改变插槽节点
    // 1. components not able to mutate slot nodes
    // 2.静态插槽内容在热重载时失败
    // 2. static slot content fails for hot-reloading
    if (
      // 不是平台保留标签，即是组件标签
      !isPlatformReservedTag(node.tag) &&
      // 标签不是slot
      node.tag !== 'slot' &&
      // 标签没有inline-template属性，即该组件标签不是内联模板
      node.attrsMap['inline-template'] == null
    ) {
      // 如果该节点满足上面条件，直接结束递归，因为插槽内容需要动态处理，不需要进行静态节点标记
      return
    }

    // 遍历该节点的所有子节点
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      // 递归遍历
      markStatic(child)
      // 只要有一个孩子节点不是静态节点，那么父亲节点也不是静态节点
      if (!child.static) {
        node.static = false
      }
    }
    if (node.ifConditions) {
      // 遍历ifConditions中的block属性指向的AST
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        // 只要有一个block指向的节点不是静态节点，那么该节点也不是静态节点
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// 标记静态根节点
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    // 类型为1的标签AST对象进入该条件

    if (node.static || node.once) {
      // 该节点是静态节点或者有v-once指令
      // 标记为staticInFor，为true或false，表示该静态节点是否在for循环节点内
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    //静态根节点不能只有静态文本的子节点，因为这样收益太低，这种情况下始终更新它就好了
    /*
      1.节点是静态节点
      2.节点有子节点
      3.该节点的子节点不能只有一个普通的文本节点
      满足上面的条件则会标记为静态根节点
    */ 
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 添加staticRoot，表示是否为静态根节点
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      // 遍历子节点
      for (let i = 0, l = node.children.length; i < l; i++) {
        // 递归调用，第二个参数根据节点是否有v-for指令，传递true或false，只要isInFor变为true，就会一层层传递下去
        // 也就可以说明是在v-for标签内
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      // 遍历ifConditions中的block属性指向的AST
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        // 递归调用
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

/*
满足下列条件中的一项则为静态节点
1.普通的文本节点
2.标签上存在v-pre指令
3.没有使用v-xxx等一系列指令，包括简写
  && 没有使用v-if和v-for和v-else
  && 不是vue的内置组件，slot和component标签
  && 是平台保留标签，即不是组件标签
  && 所有父级节点中不能为具有v-for指令的template标签
  && 该节点的AST属性中，都能在下面属性列表中找到
  'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap,staticClass,staticStyle'
*/

// 判断节点是不是静态节点
function isStatic (node: ASTNode): boolean {
  // 如果类型是2，则说明是具有插值表达式的文本节点
  if (node.type === 2) { // expression
    // 直接返回false，不是静态节点
    return false
  }
  // 如果类型是是2，普通文本节点，是静态节点
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || ( //标签上存在v-pre指令
    !node.hasBindings && // no dynamic bindings  没有使用v-xxx一系列指令，包括简写
    !node.if && !node.for && // not v-if or v-for or v-else  //没有v-if和v-for
    !isBuiltInTag(node.tag) && // not a built-in //不是vue的内置组件slot,component
    isPlatformReservedTag(node.tag) && // not a component //是平台保留标签，即不是组件标签
    !isDirectChildOfTemplateFor(node) &&  //所有父级节点中不能为具有v-for指令的template标签
    Object.keys(node).every(isStaticKey) //该节点的AST属性中，都能在下面属性列表中找到
    // 'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap,staticClass,staticStyle'
  ))
}

// 逐级往上找到父节点，只有为template标签且具有v-for属性才会返回true
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  // 递归遍历节点的父节点
  while (node.parent) {
    node = node.parent
    // 不是template标签，返回false
    if (node.tag !== 'template') {
      return false
    }
    // 是template标签才会走到这，继续判断有没有v-for指令，有则返回true
    if (node.for) {
      return true
    }
  }
  return false
}
