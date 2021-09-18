/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function;
  staticRenderFns: Array<Function>;
};

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
    const fnGenErrors = []
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
