/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  // 调用query找到DOM元素
  const el = query(id)
  // 返回元素内的节点字符串
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)//拿到el指向的Dom元素

  /* istanbul ignore if *///不能挂载到html和body上
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  // 拿到实例的选项
  const options = this.$options
  // resolve template/el and convert to render function
  if (!options.render) {//1.如果没有render函数
    // 拿到template模板，template可以是字符串形式，或者是DOM节点
    let template = options.template
    if (template) {//2.如果有template
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          // 如果是#开头，调用idToTemplate拿到DOM节点字符串
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {//template不是字符串
        // nodeType存在，说明是一个DOM元素
        template = template.innerHTML
      } else {
        // 既不是字符串也不是DOM节点，报错
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 3.如果template不存在，使用el
      template = getOuterHTML(el)
    }
    // 最终都会编译成render形式
    if (template) {
      // 模板编译内容
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        // 开发环境为true，为true时，会将编译产生的错误输出到控制台
        outputSourceRange: process.env.NODE_ENV !== 'production',
        // 是否需要解码，对一般属性的值进行解码
        shouldDecodeNewlines,
        // 是否需要解码，对a标签href属性内容进行解码
        shouldDecodeNewlinesForHref,
        // delimiters选项作用是改变插值的符号，默认是{{}}
        delimiters: options.delimiters,
      // 当设为 true 时，将会保留且渲染模板中的 HTML 注释。默认是舍弃它们
        comments: options.comments
      }, this)

      //将解析得到render函数赋值给$options.render
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }

  // 没有走上面的判断，则说明用户在选项中自定义了render函数
  return mount.call(this, el, hydrating)//直接调用mountComponent方法
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
// 获取outerHTML（outerHTML为目标节点以及子节点的字符串形式）的polyfill
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    // 如果不存在outerHTML属性，构建一个外层div，取div里面的节点字符串形式
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
