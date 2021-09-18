/* @flow */

import { addProp } from 'compiler/helpers'

export default function html (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    // 如果v-html绑定了值
    // 添加到AST的props属性中
    addProp(el, 'innerHTML', `_s(${dir.value})`, dir)
  }
}
