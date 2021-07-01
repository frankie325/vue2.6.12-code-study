/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  // 全局配置，做了层代理，Vue.config只读
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    // 修改Vue.config报错
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  // 定义全局配置
  Object.defineProperty(Vue, 'config', configDef)

  // 暴露的一些工具方法，除非你很熟悉这些方法，否则不要轻易使用
  Vue.util = {
    // 警告日志
    warn,
    // 工具函数的合并对象方法
    extend,
    // 合并选项
    mergeOptions,
    // 响应式处理
    defineReactive
  }

  // 设置Vue.set,Vue.delete,Vue.nextTick
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 设置Vue.observable
  Vue.observable = <T>(obj: T): T => {
    // 直接对传入的对象进行响应式处理
    observe(obj)
    // 返回该对象
    return obj
  }

  {/* 
      设置构造函数的options，即默认的配置项
      Vue.options:{
        components:{},
        directives:{},
        filters:{}
      }
  */}
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  {/*  将 Vue 构造函数挂载到 Vue.options._base 上 */}
  Vue.options._base = Vue

  {/* 向Vue.options.components添加内置组件，keep-alive */}
  extend(Vue.options.components, builtInComponents)

  {/* 设置Vue.use */}
  initUse(Vue)
  {/* 设置Vue.mixin */}
  initMixin(Vue)
  {/* 设置Vue.extend */}
  initExtend(Vue)
  {/* 设置Vue.component，Vue.directive，Vue.directive */}
  initAssetRegisters(Vue)
}
