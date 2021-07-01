/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) { 
  /**
   * @description: 定义Vue.use，负责为Vue安装插件
   * @param {*} plugin plugin可以为一个方法或者对象
   * 对象形如{
   *    install:function(Vue){
   *    }
   * }
   */  
  Vue.use = function (plugin: Function | Object) {
    // 拿到Vue._installedPlugins，里面保存了所有注册过的插件，如果_installedPlugins不存在，就创建一下
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      // 如果插件注册过，就直接返回，防止重复安装
      return this
    }

    // 拿到除plugin以外的其他参数，转为真数组
    const args = toArray(arguments, 1)
    // 将Vue构造函数，放到参数的第一个位置，用来给插件使用
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      // 如果plugin是对象形式，执行install方法，把参数传递进去
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // 如果plugin是方法，直接执行并把参数传递进去
      plugin.apply(null, args)
    }
    // 将plugin推入installedPlugins数组中
    installedPlugins.push(plugin)
    return this
  }
}
