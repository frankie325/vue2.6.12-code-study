/* @flow */

/*
当使用 v-bind="{ id:xxx , name:xxx }"对象形式时，会调用此方法
往AST添加wrapData属性，为一个方法
在genData的时候调用wrapListeners方法，使用_b()进行包裹
*/
export default function bind (el: ASTElement, dir: ASTDirective) {
  //往AST添加wrapListeners属性
  el.wrapData = (code: string) => {
    return `_b(${code},'${el.tag}',${dir.value},${
      dir.modifiers && dir.modifiers.prop ? 'true' : 'false'
    }${
      dir.modifiers && dir.modifiers.sync ? ',true' : ''
    })`
  }
}
