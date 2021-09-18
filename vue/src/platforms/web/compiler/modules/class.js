/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import {
  getAndRemoveAttr,
  getBindingAttr,
  baseWarn
} from 'compiler/helpers'

function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  // 获取没有使用bind指令绑定的class属性值
  const staticClass = getAndRemoveAttr(el, 'class')
  if (process.env.NODE_ENV !== 'production' && staticClass) {
    const res = parseText(staticClass, options.delimiters)
    if (res) {
      // <div class="{{  }}"></div>
      // 在非绑定的属性中使用了插值表达式，提示应该使用下面方式替代
      // <div :class=" "></div>
      warn(
        `class="${staticClass}": ` +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div class="{{ val }}">, use <div :class="val">.',
        el.rawAttrsMap['class']
      )
    }
  }
  if (staticClass) {
    // 添加到el.staticClass
    el.staticClass = JSON.stringify(staticClass)
  }
  // 获取使用bind指令的class属性值
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
  if (classBinding) {
    // 添加到el.classBinding
    el.classBinding = classBinding
  }
}

// 生成渲染函数阶段调用，生成一段字符代码，staticClass:xxxx,class:xxx
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    // 普通属性class的值
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    // 使用bind指令绑定的class的值
    data += `class:${el.classBinding},`
  }
  return data
}

export default {
  staticKeys: ['staticClass'],
  transformNode,
  genData
}
