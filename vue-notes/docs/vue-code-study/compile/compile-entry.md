# 编译器入口

## $mount

:::tip 文件目录
/src/platforms/web/entry-runtime-with-compiler.js
:::
```js
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function(){ /*...*/ }
```
可以看到这里先拿到$mount方法，然后重新定义了一次$mount，那么之前的$mount是在哪定义的?
:::tip 文件目录
/src/platforms/web/runtime/index.js
:::
```js
// public mount method
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 拿到el指定的DOM元素
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}

```
为什么要定义两遍呢？  
因为Vue在构建vue.js文件时，有运行时版本和完整版本，完整版本多了编译器的模块。所以定义了两个$mount,运行时版本调用的$mount方法内就只有两行代码，少了编译器的部分，下面的$mount就是完整版本的。
```js
const idToTemplate = cached(id => {
  // 调用query找到DOM元素
  const el = query(id)
  // 返回元素内的节点字符串
  return el && el.innerHTML
})

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
```
从$mount方法中可以看出，如果传入了render选项会直接调用mount方法，不会进行编译处理。render选项不存在则获取template模板，template模板还不存在，则获取el指定DOM元素，所以他们的优先级是```render > template > el```  

**template其实可以传入三种值**
1. HTML模板字符串
2. id选择器
3. 真实的DOM元素


模板编译的入口```compileToFunctions```方法，将传入的HTML模板字符串编译成渲染函数，找到compileToFunctions

```js
const { compile, compileToFunctions } = createCompiler(baseOptions)
```
先只展示一些关键代码，看清楚流程，后面再说每个函数具体的作用。```compileToFunctions```是通过执行```createCompiler```方法后解构出来的，也就是说```createCompiler```执行后返回的是一个对象，对象中包含```compileToFunctions```方法，找到```createCompiler```方法
```js
export const createCompiler = createCompilerCreator(function baseCompile (template,options){ /*...*/ })
```
```createCompiler```方法又是调用```createCompilerCreator```方法执行返回的，执行该方法时传入了一个`baseCompile`函数作为参数，这个函数才是真正的编译器的核心

那```baseCompile```又是什么时候调用的，就得知道```createCompiler```执行时干了什么事情，继续找到```createCompilerCreator```
```js
export function createCompilerCreator (baseCompile) {
  return function createCompiler (baseOptions) {
    function compile (template ,options) {
       /*...*/
      const compiled = baseCompile(template.trim(), finalOptions)
      /*...*/
      return compiled
    }
    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```
```createCompilerCreator```方法执行返回```createCompiler```函数，```createCompiler```创建了一个```compile```函数。总算在```compile```函数中找到了关键代码，当```compile```执行时，调用了```baseCompile```，现在只需要知道```compile```函数是在什么时候调用就行了  

```createCompiler```执行时，返回了一个对象，包含```compile```函数和```compileToFunctions```函数，也就是前面看到的执行$mount时调用了```compileToFunctions```函数，而```compileToFunctions```方法是由```createCompileToFunctionFn```执行创建的，执行时传入了```compile```函数作为参数，所以最终肯定会在```compileToFunctions```函数中会对```compile```函数进行调用

为什么编译入口的代码处理的如此麻烦，:point_right: <a href="http://caibaojian.com/vue-design/art/80vue-compiler-start.html#%E7%90%86%E8%A7%A3%E7%BC%96%E8%AF%91%E5%99%A8%E4%BB%A3%E7%A0%81%E7%9A%84%E7%BB%84%E7%BB%87%E6%96%B9%E5%BC%8F" target="_blank" rel="noopener noreferrer" >理解编译器代码的组织方式</a> 
```js
export function createCompileToFunctionFn (compile) {
  /*...*/
  return function compileToFunctions (template, options,vm?: Component) {
    /*...*/
    const compiled = compile(template, options)
    /*...*/
  }
}
```
```createCompileToFunctionFn```执行，返回```compileToFunctions```函数，其中就调用了```compile```方法  

既然弄清了调用的流程，就看一看函数具体干了什么，先看```compileToFunctions```方法
### compileToFunctions
:::tip 文件目录
/src/compiler/to-function.js
:::
```js
// 将函数字符串转为函数
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    // 创建函数时收集产生的错误，即传入的fnGenErrors数组中
    errors.push({ err, code })
    return noop
  }
}

export function createCompileToFunctionFn (compile: Function): Function {
   // 缓存的编译结果
  const cache = Object.create(null)
  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    // 复制一份传入的编译选项
    options = extend({}, options)
    // 拿到错误信息提示函数
    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      /*
          检测可能的 CSP(Content Security Policy 内容安全策略) 限制
          将模板字符串编译成渲染函数依赖 new Function()
          如果策略比较严格，new Function() 将会受到影响，不可用
          解决方案：1.放宽CSP策略。2.预编译
      */
      try {
        // 捕获错误
        new Function('return 1')
      } catch (e) {
        // 错误的内容中包含如 'unsafe-eval' 或者 'CSP'的字段，则报错
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
    }

    // options.delimiters存在，将其转为字符串拼接template模板作为键值，缓存模板编译的结果
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    if (cache[key]) {
      // 如果存在缓存，直接返回缓存，防止重复编译
      return cache[key]
    }

    // 执行编译函数
    const compiled = compile(template, options)

    // 检查编译期间产生的 error 和 tip，分别输出到控制台
    if (process.env.NODE_ENV !== 'production') {
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
              generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
            compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
            vm
          )
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    const res = {}
    const fnGenErrors = []  //收集将render字符串转化为render函数时的错误
    // 往res对象添加render函数
    res.render = createFunction(compiled.render, fnGenErrors)
    // 往res对象添加staticRenderFns属性
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction(code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // 打印生成渲染函数时的错误
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }

    // 返回编译生成的结果，并将结果缓存
    return (cache[key] = res)
  }
}
```
- ```createCompileToFunctionFn```中创建了cache，缓存了编译结果
- 调用了```compile```函数，生成render字符串
- 使用```new Function```将render字符串转化为真正的函数

### compile
:::tip 文件目录
/src/compiler/create-compile.js
:::
```js
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // 最终的编译配置对象
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      // 负责记录错误信息和提示信息
      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {
        // 传入的编译选项存在
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length
          // 增强 日志 方法
          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        if (options.modules) {
          // 如果传入了modules，将传入的modules配置项和默认的modules配置项合并到finalOptions
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        if (options.directives) {
          // 如果传入了directives，将传入的directives配置项和默认的directives配置项合并到finalOptions
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // 拷贝其他配置项
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      // 将warn方法添加到finalOptions中，用来收集编译产生的错误
      finalOptions.warn = warn
      
      // 调用baseCompile，传入模板字符串，和最终编译选项，得到编译结果
      const compiled = baseCompile(template.trim(), finalOptions)
      if (process.env.NODE_ENV !== 'production') {
        // 检查ast的错误
        detectErrors(compiled.ast, warn)
      }

      // 将编译期间产生的错误和提示挂载到编译结果上
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }
    
    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```
- ```compile```函数会将$mount中调用```compileToFunctions```传入的编译选项和默认的编译选项进行合并，默认的编译选项baseOptions为调用```createCompiler```时传入的
- 执行```baseCompile```，编译模板

调用```createCompiler```
:::tip 文件目录
/src/platforms/web/compiler/index.js
:::
```js
/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
```
baseOptions如下
:::tip 文件目录
/src/platforms/web/compiler/options.js
:::
```js
import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'
// 模板编译的默认配置选项
export const baseOptions: CompilerOptions = {
  expectHTML: true,
  // 数组，数组有三个元素，内容来自于modules下的三个文件夹
  modules,
  // directives 值是三个属性 (model、text、html) 的对象，且属性的值都是函数。
  directives,
  // isPreTag 是一个函数，判断传入的标签名字是不是pre标签
  isPreTag,
  // isPreTag 是一个函数，判断传入的标签是不是一元标签
  isUnaryTag,
  // mustUseProp是一个函数，判断传入的属性是不是要用prop进行绑定，当做原生DOM属性处理
  mustUseProp,
  // canBeLeftOpenTag是一个函数，判断是不是非一元标签，却可以自己补全并闭合的标签，
  canBeLeftOpenTag,
  // isReservedTag 是一个函数，判断是不是保留标签
  isReservedTag,
  // getTagNamespace 是一个函数，获取标签的命名空间
  getTagNamespace,
  //调用genStaticKeys生成的"staticClass,staticStyle"字符串
  staticKeys: genStaticKeys(modules)
}

```
### baseCompile
:::tip 文件目录
/src/compiler/index.js
:::

```js
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 将模板解析成ast
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 优化ast
    optimize(ast, options)
  }
  // 将ast生成渲染函数
  const code = generate(ast, options)

  // 返回解析结果
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

**baseCompile做了三件事**
1. :point_right: [parse](./parse-html.html)方法解析HTML模板生成AST树
2. optimize方法:point_right: [静态标记节点](./mark-static.html)，优化AST树 
3. :point_right: [generate](./generate.html)函数生成渲染函数字符

以上就是对于编译前对于选项的处理，真正的解析就是在```parse```函数中