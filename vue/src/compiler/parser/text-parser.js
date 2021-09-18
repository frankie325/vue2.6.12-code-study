/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

/*
  默认匹配的正则
  (?:.|\r?\n)+?  匹配除换行符的所有字符 或者 回车符0次或1次 接着换行符  +?表示惰性匹配，整体重复一次后多次，但尽可能少的重复  
  也就是匹配{{ }}以及里面的内容
*/
const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g

// 匹配在正则表达式中具有特殊含义的字符
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

// 构建新的正则表达式
const buildRegex = cached(delimiters => {
  // 用户自定义的界定符，以[ "${" , "}" ]为例
  /*
    第二个参数中的$&，表示匹配到的字符
    所以使用\\$&替换后
    ${会变成 \\$\\{
    再通过new RegExp("\\$\\{")会生成正则/\$\{/ 

    所以regexEscapeRE的作用，就是用户传入的自定义界定符如果包含正则中的特殊字符
    往字符前插入两个反斜杠，生成正则的时候，消除特殊字符的含义
  */
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  // 最终生成的正则/\$\{((?:.|\\n)+?)\}/g
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

// 解析文本内容
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  // 如果用户传入了界定符，构建新的正则，否则使用默认的
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE

  if (!tagRE.test(text)) {
    // 如果没匹配到，不包含插值表达式，为普通文本，直接返回
    return
  }

  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  /* 
    以文本 "abc{{name}}d" 为例
    使用exec匹配返回
    ["{{name}}", "name", index: 3, input: "abc{{name}}d", groups: undefined]

    这里使用exec去匹配，是因为正则表达式会记录匹配成功后的下一个位置索引lastIndex，即d位置的索引
    当while循环进行下次遍历的时候,是从d位置开始去匹配了,所以不会匹配成功,返回null,结束循环
  */
  while ((match = tagRE.exec(text))) {
    // index为插值表达式开始的索引
    index = match.index
    // push text token
    if (index > lastIndex) {
      // 截取插值表达式前的普通文本，即"abc"，赋值给tokenValue，同时推入rawTokens数组
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      // 推入tokens数组
      tokens.push(JSON.stringify(tokenValue))
      // rawTokens = ['abc']
      // tokens = ["'abc'"]
    }
    // 解析插值表达式内的字符，没有使用过滤器，返回的就是"name"
    const exp = parseFilters(match[1].trim())
    // 包装成"_s(name)"推入tokens数组  // tokens = ["'abc'","_s(name)"]
    tokens.push(`_s(${exp})`) 
    /*
      rawTokens = [
        'abc',
        {
          '@binding':"_s(name)"
        }
      ]
    */
    rawTokens.push({ '@binding': exp })

    // 更新lastIndex，为字符d的索引
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    // 如果lastIndex还小于字符的长度,就说明还剩下最后的普通字符d
    // 推入到rawTokens和tokens数组中
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
    /*
      tokens = ["'abc'","_s(name)","'d'"]
      rawTokens = [
        'abc',
        {
          '@binding':"_s(name)"
        },
        'd'
      ]
    */
  }

  /*
    最终返回一个对象
    tokens是给weex使用的
    {
      expression : "'abc'+_s(name)+'d'",
      tokens : [
        'abc',
        {
          '@binding':"_s(name)"
        },
        'd'
      ]
    }
  */ 
  return {
    expression: tokens.join('+'), 
    tokens: rawTokens
  }
}
