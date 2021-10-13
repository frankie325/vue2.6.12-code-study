/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

// 判断两个VNode是否是同一个VNode
function sameVnode (a, b) {
  return (
    // key 必须相同
    a.key === b.key &&
    // 如果是异步组件的占位注释节点， 那么步组件的工厂函数也必须相同
    a.asyncFactory === b.asyncFactory && (
      (
        a.tag === b.tag && //标签相同
        a.isComment === b.isComment && //但是注释节点
        isDef(a.data) === isDef(b.data) && //都有data属性
        sameInputType(a, b) // 为同一类型的input标签
      ) || (
        isTrue(a.isAsyncPlaceholder) && //是异步组件的占位注释节点
        isUndef(b.asyncFactory.error)  //且异步组件没有加载失败
      )
    )
  )
}

// 判断是否是同一类型的input标签
function sameInputType (a, b) {
  if (a.tag !== 'input') return true //不是input标签返回true
  let i
  const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type //拿到input标签的type属性
  const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type //拿到input标签的type属性
  // 如果两个type类型相等 或者 都是输入型的input标签
  return typeA === typeB || isTextInputType(typeA) && isTextInputType(typeB)
}

/*
  创建一个新的对象，值为旧开始和旧结束之间节点的索引，以属性key为键
  没有属性key的节点，不会创建到该对象中
*/
function createKeyToOldIdx (children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    // 定义了key属性，才会添加进去
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction (backend) {
  let i, j
  const cbs = {}

  const { modules, nodeOps } = backend
  /*
    将modules中的方法提取出来，后面会通过调用这些方法完成对应的操作
    cbs:{
      create:[ fn1, fn2,... ],
      activate:[ fn1, fn2,... ],
      update:[ fn1, fn2,... ],
      remove:[ fn1, fn2,... ],
      destroy:[ fn1, fn2,... ],
    }
  */
  for (i = 0; i < hooks.length; ++i) { //遍历hooks
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) { //遍历modules,
      if (isDef(modules[j][hooks[i]])) {
        // 将modules中对应的方法添加到cbs中
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

  // 根据DOM元素，创建一个空的VNode
  function emptyNodeAt (elm) {
    // elm为$el指向的标签
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  function createRmCb (childElm, listeners) {
    function remove () {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }

  function removeNode (el) {
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  // 是否为未知标签
  function isUnknownElement (vnode, inVPre) {
    return (
      !inVPre && //不在v-pre内
      !vnode.ns && //没有命名空间
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          // 也不是全局定义的忽略警告的未知标签
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag) //全局方法isUnknownElement判断为未知标签
    )
    // 上面全部满足说明是未知标签
  }

  // 用来判断标签是不是在v-pre里面，大于0，则在v-pre里面
  let creatingElmInVPre = 0

  function createElm (
    vnode, //新的VNode
    insertedVnodeQueue,
    parentElm, //父级DOM元素
    refElm, //之后紧跟的DOM元素
    nested,
    ownerArray,
    index
  ) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    vnode.isRootInsert = !nested // for transition enter check

    // 调用createComponent处理组件VNode，不是组件VNode则继续往下执行
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    // 下面是处理非组件VNode
    const data = vnode.data //拿到data属性
    const children = vnode.children //拿到子VNode
    const tag = vnode.tag //拿到标签名
    if (isDef(tag)) {
      if (process.env.NODE_ENV !== 'production') {
        if (data && data.pre) {
          // 如果存在v-pre指令，creatingElmInVPre加一
          creatingElmInVPre++
        }
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          // 未知标签名，报错
          warn(
            'Unknown custom element: <' + tag + '> - did you ' +
            'register the component correctly? For recursive components, ' +
            'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      
      vnode.elm = vnode.ns// 如果是存在命名空间的VNode
        ? nodeOps.createElementNS(vnode.ns, tag) //调用createElementNS创建标签
        : nodeOps.createElement(tag, vnode) //调用createElement创建标签
      // 设置标签的css作用域属性
      setScope(vnode)

      /* istanbul ignore if */
      if (__WEEX__) { //微信平台的处理，不做介绍
        // in Weex, the default insertion order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
        if (!appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
        createChildren(vnode, children, insertedVnodeQueue)
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
      } else {
        // 处理子VNode，会递归调用createElm
        createChildren(vnode, children, insertedVnodeQueue)
        if (isDef(data)) {
          // 等所有子组件创建完毕，才会执行各个模块的create方法
          // 调用钩子，往标签上添加属性
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        // 插入该标签到父标签
        insert(parentElm, vnode.elm, refElm)
      }

      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        // v-pre标签创建完毕，creatingElmInVPre减一
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {// 如果是注释VNode
      vnode.elm = nodeOps.createComment(vnode.text) //创建注释标签
      insert(parentElm, vnode.elm, refElm)//插入到父标签中
    } else {// 否则为文本VNode
      vnode.elm = nodeOps.createTextNode(vnode.text)//创建文本标签
      insert(parentElm, vnode.elm, refElm) //插入到父标签中
    }
  }

  // 处理组件VNode
  function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data
    if (isDef(i)) {//如果VNode定义了data属性

      // 验证组件实例是否已经存在且被 keep-alive 包裹
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive

      if (isDef(i = i.hook) && isDef(i = i.init)) {
        // 执行组件的hook.init钩子
        i(vnode, false /* hydrating */)
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) { //组件创建完了，就可以拿到组件实例了
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm)//插入标签到父节点
        if (isTrue(isReactivated)) {
          // 如果组件被keep-alive 包裹，激活组件
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }

  // 执行各个模块的的 create 钩子
  function initComponent (vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      // 如果pendingInsert已经存在了，则将组件内有insert钩子的VNode的进行合并
      insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert)
      vnode.data.pendingInsert = null //置为空
    }
    // 拿到组件实例的$el，组件此时已经创建完毕，$el为组件创建的DOM元素，添加到组件VNode.elm上
    vnode.elm = vnode.componentInstance.$el
    if (isPatchable(vnode)) {//如果组件根节点存在
      // 执行各个模块的的 create 钩子
      invokeCreateHooks(vnode, insertedVnodeQueue)
      // 设置css作用域属性
      setScope(vnode)
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      // 组件根节点不存在
      registerRef(vnode) //只注册组件的ref
      // make sure to invoke the insert hook
      // 将组件VNode推入队列
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    // 解决transition 动画不触发的问题的处理
    let innerNode = vnode
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm)
  }

  // 插入标签到父标签
  function insert (parent, elm, ref) {
    if (isDef(parent)) { //如果存在父标签
      if (isDef(ref)) {// 如果下一个紧邻的标签存在
        if (nodeOps.parentNode(ref) === parent) { //如果要插入的标签与紧邻的标签是同一个父标签
          // 调用insertBefore插入标签
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else { //下一个紧邻的标签不存在
        // 调用appendChild添加到末尾
        nodeOps.appendChild(parent, elm)
      }
    }
  }

  // 创建子VNode
  function createChildren (vnode, children, insertedVnodeQueue) {
    if (Array.isArray(children)) {
      // 子VNode如果是数组，一般情况下都是数组了
      if (process.env.NODE_ENV !== 'production') {
        // 检查key属性不能重复
        checkDuplicateKeys(children)
      }
      for (let i = 0; i < children.length; ++i) { //遍历子VNode
        // 调用createElm创建元素
        createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
      }
    } else if (isPrimitive(vnode.text)) {
      // 如果子VNode不是数组
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }

  // 判断组件是否可以继续进行patch
  function isPatchable (vnode) {
    while (vnode.componentInstance) { //循环成立的条件是，组件内的根节点又是一个组件
      vnode = vnode.componentInstance._vnode //组件VNode的componentInstance的_vnode属性，为组件模板经过编译后的VNode
    }
    // 返回组件渲染的VNode的标签名，判断组件的根节点不存在的情况
    return isDef(vnode.tag)
  }

  // 调用钩子，往标签上添加属性
  function invokeCreateHooks (vnode, insertedVnodeQueue) {
    // 调用cbs中的create方法
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }

    // hook钩子，有组件的hook钩子，普通标签上如果使用了自定义指令，也会有insert钩子
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) {
      // 组件好像没有 create 钩子
      if (isDef(i.create)) i.create(emptyNode, vnode)
      // 如果存在insert钩子，将VNode推入到队列
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  // 为DOM元素添加css作用域属性
  function setScope (vnode) {
    let i
    if (isDef(i = vnode.fnScopeId)) { 
      // 如果VNode存在fnScopeId属性，那么给标签添加该属性
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef(i = ancestor.context) && isDef(i = i.$options._scopeId)) {
          // 为组件标签指向的DOM元素，添加css作用域属性，为父实例的_scopeId属性
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (isDef(i = activeInstance) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef(i = i.$options._scopeId)
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  // 遍历节点VNode数组，创建标签插入到文档中
  function addVnodes (parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx)
    }
  }

  // 销毁节点
  function invokeDestroyHook (vnode) {
    let i, j
    const data = vnode.data//获取data属性
    if (isDef(data)) {
      // 如果存在data.hook，说明是该VNode是组件，调用data.hook内的destroy钩子
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode)
      // 调用cbs中的destroy方法
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }

    if (isDef(i = vnode.children)) {
      // 如果存在子节点，则继续递归调用，进行销毁
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  // 移除旧的节点
  function removeVnodes (vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]//拿到VNode数组内的VNode
      if (isDef(ch)) { //如果存在
        if (isDef(ch.tag)) {//如果是标签
          removeAndInvokeRemoveHook(ch)
          invokeDestroyHook(ch) //销毁子VNode
        } else { // Text node
          // 如果是文本节点，直接移除
          removeNode(ch.elm)
        }
      }
    }
  }

  // 
  function removeAndInvokeRemoveHook (vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      // 如果要移除的VNode是组件VNode，
      if (isDef(i = vnode.componentInstance) && isDef(i = i._vnode) && isDef(i.data)) {
        // 将组件内部的VNode，传入，进行递归调用
        removeAndInvokeRemoveHook(i, rm)
      }
      for (i = 0; i < cbs.remove.length; ++i) {//调用各个transition的remove
        cbs.remove[i](vnode, rm)
      }
      if (isDef(i = vnode.data.hook) && isDef(i = i.remove)) {
        //调用transition组件的remove钩子
        i(vnode, rm)
      } else {
        // 执行返回的removeNode
        rm()
      }
    } else {
      removeNode(vnode.elm)
    }
  }


  /*
      diff算法
      
      都是在操作旧节点数组，对比新节点数组去移动旧节点数组
      假设四种情况
      旧开始和新开始是同一个节点，不移动
      旧开始和新结束是同一个节点，旧开始移动到旧结束的位置
      旧结束和新开始是同一个节点，旧结束移动到旧开始的位置
      旧结束和新结束是同一个节点，不移动

      上面四种都没命中
      找到新开始节点，在旧节点中是相同节点的索引位置
      如果找不到，那么说明是个新创建的节点，添加到旧开始的前面
      如果找到了，那么将该旧节点移动到旧开始前面，并且该旧节点的位置设置为undefined

      当循环结束了
      如果是旧开始大于旧结束了，说明旧节点已经遍历完了，那么新节点剩下的部分，就是需要新增的
      如果是新开始大于新结束了，说明新节点已经遍历完了，那么旧节点剩下的部分，就是需要删除的
  */
  function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
    let oldStartIdx = 0                     //老VNode数组的开始索引
    let newStartIdx = 0                     //新VNode数组的开始索引
    let oldEndIdx = oldCh.length - 1        //老VNode数组的结束索引
    let oldStartVnode = oldCh[0]            //第一个老VNode
    let oldEndVnode = oldCh[oldEndIdx]      //最后一个老VNode
    let newEndIdx = newCh.length - 1        //新VNode数组的结束索引
    let newStartVnode = newCh[0]            //第一个新VNode
    let newEndVnode = newCh[newEndIdx]      //最后一个新VNode
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly

    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(newCh)
    }

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) { //如果该旧开始节点为undefined
        // 说明该旧节点被移动了，旧开始指针向后移动
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {//如果该旧结束节点为undefined
        // 说明该旧节点被移动了，旧结束指针向前移动
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) { //旧开始和新开始是同一个节点
        // 调用patchVnode，更新标签
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        oldStartVnode = oldCh[++oldStartIdx] //旧开始指针向后移动
        newStartVnode = newCh[++newStartIdx] //新开始指针向后移动
      } else if (sameVnode(oldEndVnode, newEndVnode)) { //旧结束和新结束是同一个节点
        // 调用patchVnode，更新标签
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        oldEndVnode = oldCh[--oldEndIdx]  //旧结束指针向前移动
        newEndVnode = newCh[--newEndIdx]  //新结束指针向前移动
      } else if (sameVnode(oldStartVnode, newEndVnode)) { //旧开始和新结束是同一个节点
        // 调用patchVnode，更新标签
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        // 将旧开始对应的标签移动到旧结束的位置
        canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
        oldStartVnode = oldCh[++oldStartIdx] //旧开始指针向后移动
        newEndVnode = newCh[--newEndIdx] //新结束指针向前移动
      } else if (sameVnode(oldEndVnode, newStartVnode)) { //旧结束和新开始是同一个节点
        // 调用patchVnode，更新标签
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        // 将旧结束对应的标签移动到旧开始的位置
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        oldEndVnode = oldCh[--oldEndIdx]  //旧结束指针向前移动
        newStartVnode = newCh[++newStartIdx] //新开始指针向后移动
      } else { //上面四种假设都没有命中

        // 创建一个旧开始和旧结束之间节点的索引对象
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        idxInOld = isDef(newStartVnode.key)  //如果新开始节点定义了key属性
          ? oldKeyToIdx[newStartVnode.key] //直接用key属性，拿到相同节点的索引
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx) //没有key属性，就通过findIdxInOld找到相同节点的索引
        if (isUndef(idxInOld)) { // New element  如果没找到，说明是个新创建的节点
          // 创建该新标签，添加到旧开始前面
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        } else { //说明找到了
          vnodeToMove = oldCh[idxInOld] //拿到该相同的节点
          if (sameVnode(vnodeToMove, newStartVnode)) {
            // 调用patchVnode，更新标签
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
            oldCh[idxInOld] = undefined //该位置的旧节点设置为undefined
            // 将该位置的旧节点移动到旧开始前面
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
          } else {
            // same key but different element. treat as new element
            // key属性相同但不是同一个节点，那么视为新节点，创建该新标签，添加到旧开始前面
            createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
          }
        }

        // 新开始指针向后移动
        newStartVnode = newCh[++newStartIdx]
      }
    }

    if (oldStartIdx > oldEndIdx) { //如果是旧开始大于旧结束了，说明旧节点已经遍历完了，那么新节点剩下的部分，就是需要新增的
      // 插入到该节点前面，为新结束的下一个节点
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      // 调用addVnodes，遍历剩下的新节点，创建标签进行插入
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
    } else if (newStartIdx > newEndIdx) { //如果是新开始大于新结束了，说明新节点已经遍历完了，那么旧节点剩下的部分，就是需要删除的
      // 移除剩余的旧节点
      removeVnodes(oldCh, oldStartIdx, oldEndIdx)
    }
  }

  // 判断子VNode的key属性不能重复
  function checkDuplicateKeys (children) {
    const seenKeys = {}
    // 遍历子VNode
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key //拿到key属性
      if (isDef(key)) {
        if (seenKeys[key]) {
          // 已经存在了，报错
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          // 刚开始不存在与seenKeys中，添加到seenKeys，赋值为true
          seenKeys[key] = true
        }
      }
    }
  }

  // 从旧开始和旧结束中的节点中，找到相同的节点，返回它的索引
  function findIdxInOld (node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  /*
      patchVnode根据新的VNode，来对旧的标签进行全量的属性更新
      然后根据子VNode来选择执行步骤
      如果新节点是文本节点，则直接更新
      如果新老节点都有孩子，则递归执行 diff
      如果新节点有孩子，老节点没孩子，则新增新节点的孩子节点
      如果老节点有孩子，新节点没孩子，则删除老节点的这些孩子
  */ 
  function patchVnode (
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly
  ) {
    // 新VNode和旧VNode相等，直接返回
    if (oldVnode === vnode) {
      return
    }

    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    const elm = vnode.elm = oldVnode.elm //拿到旧的DOM元素，下面会进行更新

    // 如果旧的VNode是异步组件的占位注释节点
    if (isTrue(oldVnode.isAsyncPlaceholder)) { 
      if (isDef(vnode.asyncFactory.resolved)) { //如果新的VNode存在resolved，说明异步组件加载完了
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    if (isTrue(vnode.isStatic) && //为静态节点
      isTrue(oldVnode.isStatic) && //为静态节点
      vnode.key === oldVnode.key && //key相等
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce)) //新节点是克隆的或者有v-once指令
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      // 直接返回，不用更新了
      return
    }

    let i
    const data = vnode.data
    // 执行组件的prepatch钩子，调用updateChildComponent更新组件实例中的一堆属性
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
      i(oldVnode, vnode)
    }

    const oldCh = oldVnode.children  //旧的子VNode
    const ch = vnode.children //新的子VNode
    if (isDef(data) && isPatchable(vnode)) {
      // 执行cbs.update全量更新属性，事件等。Vue 3.0 在这里做了很多的优化
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode) //执行data.hook.update钩子，好像没有
    }
    if (isUndef(vnode.text)) { //如果不是文本节点
      if (isDef(oldCh) && isDef(ch)) {
        // 如果新旧VNode都有孩子，则递归执行 diff 过程
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {  //旧的子VNode不存在，新的子VNode存在，则创建新孩子节点
        if (process.env.NODE_ENV !== 'production') {
          // 检查子VNode的key属性不能重复
          checkDuplicateKeys(ch)
        }
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '') //如果旧的节点内是文本，则情况textContent属性
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue) //生成子节点DOM树，插入父节点中
      } else if (isDef(oldCh)) {//新的子VNode不存在，旧的子VNode存在，则删除旧孩子节点
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) { //新VNode是文本节点，且内容不相同，则更新文本
      nodeOps.setTextContent(elm, vnode.text)
    }
    if (isDef(data)) {
      // 如果存在data.hook.postpatch，则调用postpatch钩子，调用指令的更新钩子componentUpdated
      if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
    }
  }

  // 调用insert钩子
  function invokeInsertHook (vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      // 如果是组件初次渲染，将组件内所有的要执行insert钩子的VNode，添加到pendingInsert属性上
      // initComponent方法处理该组件VNode的时候，会将pendingInsert合并到insertedVnodeQueue中
      vnode.parent.data.pendingInsert = queue
    } else {
      // 如果是组件更新阶段
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match
    if (process.env.NODE_ENV !== 'production') {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode, true /* hydrating */)
      if (isDef(i = vnode.componentInstance)) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  function assertNodeMatch (node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return vnode.tag.indexOf('vue-component') === 0 || (
        !isUnknownElement(vnode, inVPre) &&
        vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    if (isUndef(vnode)) {
      // 如果新VNode不存在，但是老VNode存在，销毁老节点
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false //组件是否初次渲染
    const insertedVnodeQueue = [] //存储普通标签VNode和组件VNode的insert钩子

    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      // 1.老的VNode是undefined，说明是空挂载，一般为组件初次渲染的时候
      isInitialPatch = true //置为true
      createElm(vnode, insertedVnodeQueue)
    } else {
      const isRealElement = isDef(oldVnode.nodeType)//是否是真实的DOM元素
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        // 2.如果不是真实的DOM元素且是同一个VNode，则是更新阶段，执行patchVnode更新VNode
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        // 3.如果是真实元素或者不是同一个VNode进入该else条件
        // 不是同一个VNode不需要进行diff算法，直接替换老节点

        if (isRealElement) {
          // 如果是真实元素，则说明是首次渲染，这里的oldVnode是$el指向的DOM元素
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          // 如果VNode上有SSR_ATTR属性，则说明为服务端，处理服务端渲染的情况
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 不是服务端或者 hydration 失败，则根据$el指向的DOM元素创建一个 VNode 节点
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        const oldElm = oldVnode.elm //拿到VNode指向的真实DOM元素
        const parentElm = nodeOps.parentNode(oldElm) //拿到他的父节点

        // create new node
        // 根据新的VNode创建DOM树
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          // 极其罕见的边缘情况：如果旧元素在transition的离开阶段不要进行插入， 仅在keep-alive加上transition使用时发生
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )
        
        // update parent placeholder node element, recursively
        if (isDef(vnode.parent)) {//如果该VNode存在parent属性，说明是组件的的根VNode
          // 能进入这个条件说明，组件的根节点VNode发生了变化，比如根节点是通过v-if和v-else去控制的
          // 而进行占位的组件VNode中elm指向的DOM元素还是旧的，需要进行更新

          let ancestor = vnode.parent//拿到组件VNode
          const patchable = isPatchable(vnode)
          while (ancestor) { //循环处理是因为组件的根标签又是组件的情况
            for (let i = 0; i < cbs.destroy.length; ++i) {
              // 调用destroy，销毁旧的值
              cbs.destroy[i](ancestor)
            }
            // 更新elm
            ancestor.elm = vnode.elm
            if (patchable) {// 组件内存在根节点
              for (let i = 0; i < cbs.create.length; ++i) {
                // 调用create更新
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) { //组件上使用了自定义指令，就会存在merged属性
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) { //跳过第一个，因为会执行组件的mounted钩子
                  // 执行组件标签上指令的insert钩子
                  insert.fns[i]()
                }
              }
            } else {//组件内不存在根节点
              // 那么更新该组件在父组件的ref即可
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }

        // destroy old node
        if (isDef(parentElm)) { //如果存在父节点，对应首次渲染
          removeVnodes([oldVnode], 0, 0) //移除$el指向的旧的DOM元素
        } else if (isDef(oldVnode.tag)) {//否则对应组件根节点使用了v-if的情况
          // 调用destroy钩子
          invokeDestroyHook(oldVnode)
        }
      }
    }

    // 调用insert钩子，放在最后面保证所有DOM元素都已经插入到页面中，才执行insert钩子
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    
    // 返回生成DOM树
    return vnode.elm
  }
}
