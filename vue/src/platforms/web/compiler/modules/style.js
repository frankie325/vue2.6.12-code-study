/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import { parseStyleText } from 'web/util/style'
import {
  getAndRemoveAttr,
  getBindingAttr,
  baseWarn
} from 'compiler/helpers'

function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  // 获取没有使用bind指令绑定的style属性值
  const staticStyle = getAndRemoveAttr(el, 'style')
  if (staticStyle) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      const res = parseText(staticStyle, options.delimiters)
      if (res) {
        // 提示不能使用插值表达式
        warn(
          `style="${staticStyle}": ` +
          'Interpolation inside attributes has been removed. ' +
          'Use v-bind or the colon shorthand instead. For example, ' +
          'instead of <div style="{{ val }}">, use <div :style="val">.',
          el.rawAttrsMap['style']
        )
      }
    }
    /*
      <div style="color: red; background: green;"></div>
      经过parseStyleText函数处理的字符color: red; background: green;
      el.staticStyle为
          JSON.stringify({
            color: 'red',
            background: 'green'
          })
    */
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle))
  }

  // 获取使用bind指令的style属性值
  const styleBinding = getBindingAttr(el, 'style', false /* getStatic */)
  if (styleBinding) {
    // 添加到el.styleBinding
    el.styleBinding = styleBinding
  }
}

// 生成渲染函数阶段调用，生成一段字符代码，staticStyle:xxxx,style:xxx
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticStyle) {
    //普通属性style的值，经过了parseStyleText处理
    data += `staticStyle:${el.staticStyle},`
  }
  if (el.styleBinding) {
    //使用bind指令绑定的style的值
    data += `style:(${el.styleBinding}),`
  }
  return data
}

export default {
  staticKeys: ['staticStyle'],
  transformNode,
  genData
}
