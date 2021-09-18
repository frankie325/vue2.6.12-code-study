/* @flow */

import { addProp } from 'compiler/helpers'

export default function text (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    // 如果v-text绑定了值
    // 添加到AST的props属性中
    addProp(el, 'textContent', `_s(${dir.value})`, dir)
  }
}
