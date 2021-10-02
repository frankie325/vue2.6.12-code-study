/* @flow */

import { emptyNode } from 'core/vdom/patch'
import { resolveAsset, handleError } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'

export default {
  create: updateDirectives,
  update: updateDirectives,
  destroy: function unbindDirectives (vnode: VNodeWithData) {
    // 销毁时，传入第二个参数为空VNode
    updateDirectives(vnode, emptyNode)
  }
}

// 自定义指令的的处理
function updateDirectives (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (oldVnode.data.directives || vnode.data.directives) {
    _update(oldVnode, vnode)
  }
}

function _update (oldVnode, vnode) {
  const isCreate = oldVnode === emptyNode //如果oldVnode是空VNode，说明是首次加载指令
  const isDestroy = vnode === emptyNode // 如果vnode是空VNode，说明是与指令解绑
  const oldDirs = normalizeDirectives(oldVnode.data.directives, oldVnode.context)//旧的指令信息
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context)//新的指令信息

  const dirsWithInsert = []
  const dirsWithPostpatch = []

  let key, oldDir, dir
  for (key in newDirs) {
    // 遍历新的指令
    oldDir = oldDirs[key] //找到对应旧的指令 
    dir = newDirs[key]
    if (!oldDir) { //如果旧的不存在，那么在标签上使用的是新的自定义指令
      // new directive, bind
      callHook(dir, 'bind', vnode, oldVnode) //直接调用bind钩子
      if (dir.def && dir.def.inserted) {
        // 指令选项推入dirsWithInsert数组
        dirsWithInsert.push(dir)
      }
    } else {
      // existing directive, update
      // 如果旧的存在，往指令选项上添加旧的信息
      dir.oldValue = oldDir.value
      dir.oldArg = oldDir.arg
      callHook(dir, 'update', vnode, oldVnode)//调用update钩子
      if (dir.def && dir.def.componentUpdated) {
        // 指令选项推入dirsWithPostpatch数组
        dirsWithPostpatch.push(dir)
      }
    }
  }

  if (dirsWithInsert.length) {
    // 要调用的指令，inserted钩子
    const callInsert = () => {
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], 'inserted', vnode, oldVnode)
      }
    }
    if (isCreate) {
      // 如果是首次创建，则先将inserted钩子合并到组件的insert钩子中
      // 等到组件内所有标签创建完毕后，会执行insert钩子
      mergeVNodeHook(vnode, 'insert', callInsert)
    } else {
      // 如果不是首次创建，则直接调用
      callInsert()
    }
  }

  if (dirsWithPostpatch.length) {
    // 合并到postpatch钩子，更新时会调用指令的componentUpdated钩子
    mergeVNodeHook(vnode, 'postpatch', () => {
      for (let i = 0; i < dirsWithPostpatch.length; i++) {
        callHook(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode)
      }
    })
  }

  if (!isCreate) {
    // 不是首次创建，旧的指令在新的中找不到
    // 说明旧的指令没有使用了，进行解绑，调用unbind钩子
    for (key in oldDirs) {
      if (!newDirs[key]) {
        // no longer present, unbind
        callHook(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy)
      }
    }
  }
}

const emptyModifiers = Object.create(null)



/*
     以v-custom:[arg].xxx.xxx = "method"为例
     {
       name: "custom", // 则name为custom
       rawName: "v-custom:[arg].xxx.xxx", //属性key
       value: JSON.stringify("method"), //属性值
       arg: "arg", //指令绑定的参数
       isDynamicArg: true, //动态属性
       modifiers: JSON.stringify({...}), //修饰符
       def: {
          bind: function () {},
          inserted: function () {},
          update: function () {},
          componentUpdated: function () {},
          unbind: function () {}
       } //用户注册自定义指令时的选项
     },
     进一步处理指令的每个指令选项，转化成以rawName为key的对象，并返回
     {
        "v-custom:[arg].xxx.xxx": { 上面的指令选项信息 }
     }
*/
function normalizeDirectives (
  dirs: ?Array<VNodeDirective>,
  vm: Component
): { [key: string]: VNodeDirective } {
  const res = Object.create(null)
  if (!dirs) {
    // $flow-disable-line
    return res
  }
  let i, dir
  // 遍历指令
  for (i = 0; i < dirs.length; i++) {
    dir = dirs[i]
    if (!dir.modifiers) {
      // 如果没有modifiers对象，添加一个空对象
      // $flow-disable-line
      dir.modifiers = emptyModifiers
    }
    // 获取rawName
    res[getRawDirName(dir)] = dir
    // 从$options.directives，拿到指令选项
    dir.def = resolveAsset(vm.$options, 'directives', dir.name, true)
  }
  // $flow-disable-line
  return res
}

// 拿到RawName，如果没有RawName，将name和修饰符进行拼接得到rawName
function getRawDirName (dir: VNodeDirective): string {
  return dir.rawName || `${dir.name}.${Object.keys(dir.modifiers || {}).join('.')}`
}

// 调用指令对应的钩子
function callHook (dir, hook, vnode, oldVnode, isDestroy) {
  const fn = dir.def && dir.def[hook]
  if (fn) {
    // 如果对应的钩子存在，进行调用
    try {
      fn(vnode.elm, dir, vnode, oldVnode, isDestroy)
    } catch (e) {
      handleError(e, vnode.context, `directive ${dir.name} ${hook} hook`)
    }
  }
}
