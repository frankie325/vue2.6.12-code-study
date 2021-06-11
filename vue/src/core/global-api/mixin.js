/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 更新构造函数的options
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
