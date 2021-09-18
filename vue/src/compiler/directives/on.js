/* @flow */

import { warn } from 'core/util/index'

/*
当使用 v-on="{ click:handleClick }"对象形式时，会调用此方法
往AST添加wrapListeners属性，为一个方法
在genData的时候调用wrapListeners方法，使用_g()进行包裹
*/
export default function on (el: ASTElement, dir: ASTDirective) {
  if (process.env.NODE_ENV !== 'production' && dir.modifiers) {
    // 不带参数的 v-on 不支持修饰符
    warn(`v-on without argument does not support modifiers.`)
  }
  // 往AST添加wrapListeners属性
  el.wrapListeners = (code: string) => `_g(${code},${dir.value})`
}
