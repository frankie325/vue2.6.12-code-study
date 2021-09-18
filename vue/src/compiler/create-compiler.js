/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

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
