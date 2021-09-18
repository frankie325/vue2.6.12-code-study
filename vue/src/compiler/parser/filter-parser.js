/* @flow */

//匹配数字或字母或下划线或 )、.、+、-、_、$、] 这些字符之一
const validDivisionCharRE = /[\w).+\-_$\]]/


/*
  parseFilters用来解析属性中的过滤器
  vue怎么来判断字符|，是管道符的呢？
  vue对于管道符|的判断只花了一些简单的判断，没必要花大量的精力去编写大量的代码去判断。对于难以判断的表达式，用计算属性就可以了
*/
export function parseFilters (exp: string): string {
  let inSingle = false //当前字符是否在单引号(')中
  let inDouble = false //当前字符是否在双引号(")中
  let inTemplateString = false //当前字符是否在模板字符串(`)中
  let inRegex = false //当前字符是否在正则表达式内
  let curly = 0 //当前字符是否在花括号({)内，为0说明没在里面
  let square = 0 //当前字符是否在方括号([)内，为0说明没在里面
  let paren = 0 //当前字符是否在圆括号(内，为0说明没在里面
  let lastFilterIndex = 0 //管道符右边第一个字符的索引
  // expression保存管道符左边的字符，即过滤器过滤的变量
  // filters保存所有的过滤器，为数组
  let c, prev, i, expression, filters

  // 将属性值字符串从第一个字符遍历到末尾
  for (i = 0; i < exp.length; i++) {
    // prev保存的是上一个字符的ASCII码
    prev = c
    // c保存当前的字符的ASCII码
    c = exp.charCodeAt(i)
    if (inSingle) {
      // 如果当前的字符在'(单引号)内
      // 如果当前字符是单引号且前一个字符不是反斜杠(\),说明当前字符(单引号)就是字符串的结束
      if (c === 0x27 && prev !== 0x5C) inSingle = false
    } else if (inDouble) {
      // 如果当前的字符在"(双引号)内
      // 如果当前字符是双引号且前一个字符不是反斜杠(\),说明当前字符(双引号)就是字符串的结束
      if (c === 0x22 && prev !== 0x5C) inDouble = false
    } else if (inTemplateString) {
      // 如果当前的字符在模板字符串内
      // 如果当前字符是模板引号且前一个字符不是反斜杠(\),说明当前字符(模板引号)就是模板字符串的结束
      if (c === 0x60 && prev !== 0x5C) inTemplateString = false
    } else if (inRegex) {
      // 如果当前读取的字符存在于正则表达式内
      // 如果当前字符是/且前一个字符不是反斜杠(\),说明当前字符就是正则表达式的结束
      if (c === 0x2f && prev !== 0x5C) inRegex = false
    } else if (
      // 1.当前字符为管道符(|)
      c === 0x7C && // pipe
      // 2.当前字符前一个字符不是管道符
      exp.charCodeAt(i + 1) !== 0x7C &&
      // 3.当前字符后一个字符不是管道符
      exp.charCodeAt(i - 1) !== 0x7C &&
      // 4.该字符不能处于花括号、方括号、圆括号之内
      !curly && !square && !paren
    ) {
      // 满足上面4个条件，说明该管道符就是用来当做过滤器分界线的符号
      if (expression === undefined) {
        // first filter, end of expression
        // 碰到了第一个管道符走这里
        // 拿到管道符右边第一个字符的索引
        lastFilterIndex = i + 1
        // expression为管道符左边的字符
        expression = exp.slice(0, i).trim()
      } else {
        // 碰到的第二个即以后的管道符，调用pushFilter
        pushFilter()
      }
    } else {
      switch (c) {
        // 如果当前字符为双引号(")，则将 inDouble 变量的值设置为 true
        case 0x22: inDouble = true; break         // "
        // 如果当前字符为单引号(‘)，则将 inSingle 变量的值设置为 true
        case 0x27: inSingle = true; break         // '
        // 如果当前字符为模板字符串的定义字符(`)，则将 inTemplateString 变量的值设置为
        case 0x60: inTemplateString = true; break // `
        // 如果当前字符是左圆括号(，则将 paren 变量的值加一
        case 0x28: paren++; break                 // (
        // 如果当前字符是右圆括号)，则将 paren 变量的值减一
        case 0x29: paren--; break                 // )
        // 如果当前字符是左方括号[，则将 square 变量的值加一
        case 0x5B: square++; break                // [
        // 如果当前字符是右方括号]，则将 square 变量的值减一
        case 0x5D: square--; break                // ]
        // 如果当前字符是左花括号{，则将 curly 变量的值加一
        case 0x7B: curly++; break                 // {
        //如果当前字符是右花括号}，则将 curly 变量的值减一 
        case 0x7D: curly--; break                 // }
      }
      if (c === 0x2f) { // /
        // 如果当前字符是斜杠/
        // j为前一个字符的索引
        let j = i - 1
        let p
        // find first non-whitespace prev char
        for (; j >= 0; j--) {
          // 从前一个字符往前遍历
          // 拿到该索引的字符
          p = exp.charAt(j)
          // 找到前面第一个不为空的字符，跳出循环，如果没有找到说明斜杠/字符前都是空白符
          if (p !== ' ') break
        }
        if (!p || !validDivisionCharRE.test(p)) {
          // 如果p不是validDivisionCharRE中的任一个字符，vue则认为当前字符串是正则的开始
          inRegex = true
        }
      }
    }
  }

  // for循环遍历完了
  if (expression === undefined) {
    // expression如果还未undefined，说明没有匹配到管道符，将整个字符串赋值给expression
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) {
    // 因为for循环里面处理不了最后一个过滤器
    // 所以调用pushFilter，将最后一个过滤器的字符推入到filters数组中
    pushFilter()
  }

  /*
    比如 <div :key="id | filter1 | filter2"></div>
    expression = "id";
    filters = ["filter1","filter2"]
  */ 
  function pushFilter () {
    // 截取两个管道符之间的的字符，推入的filters数组中
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    // 更新lastFilterIndex
    lastFilterIndex = i + 1
  }

  if (filters) {
    for (i = 0; i < filters.length; i++) {
      // 遍历filters数组，对过滤器进行一层包裹
      expression = wrapFilter(expression, filters[i])
    }
  }

  // 返回expression，即绑定的属性值
  // 最终返回的expression有两种形式
  // 1.没有过滤器，则是普通的字符串形式，绑定的什么值就是什么
  // 2.有过滤器，则是包装过的字符形式，如'_f("filter2")(_f("filter1")(id),arg1,arg2)'
  return expression
}

/*
  例子：<div :key="id | filter1 | filter2(arg1,arg2)"></div>
*/
function wrapFilter (exp: string, filter: string): string {
  // 拿到左圆括号的索引,过滤器是可以传递参数的
  const i = filter.indexOf('(')
  if (i < 0) {
    // 如果没有左圆括号
    // 返回 '_f("filter1")(id)'
    return `_f("${filter}")(${exp})`
  } else {
    // 如果有左圆括号，比如filter2(arg1,arg2)
    // 拿到左圆括号左边的字符，即 filter2
    const name = filter.slice(0, i)
    // 拿到左圆括号右边的字符，即 arg1,arg2)
    const args = filter.slice(i + 1)
    // args不等于),则说明传递了参数
    // 最终返回的字符为'_f("filter2")(_f("filter1")(id),arg1,arg2)'
    // 可以看到，第一个过滤器的值作为第二个过滤器的第一个参数传递了进去
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
