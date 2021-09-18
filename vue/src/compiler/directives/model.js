/* @flow */

/**
 * Cross-platform code generation for component v-model
 */
// 处理组件上的v-model指令
export function genComponentModel (
  el: ASTElement,
  value: string,//v-model绑定的值
  modifiers: ?ASTModifiers
): ?boolean {
  // 获取v-model的修饰符
  const { number, trim } = modifiers || {}

  const baseValueExpression = '$$v'
  let valueExpression = baseValueExpression
  // 如果存在trim修饰符
  if (trim) {
    //valueExpression为生成的字符 "typeof $$v === 'string' ? $$v.trim() : $$v"
    valueExpression =
      `(typeof ${baseValueExpression} === 'string'` +
      `? ${baseValueExpression}.trim()` +
      `: ${baseValueExpression})`
  }
  // 如果存在number修饰符
  if (number) {
    // 使用_n()进行包裹，为"_n(typeof $$v === 'string' ? $$v.trim() : $$v)"
    valueExpression = `_n(${valueExpression})`
  }
  // 以<compName v-model.trim.number="test['test1'][test2]">为例
  // 返回"$set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))" 
  const assignment = genAssignmentCode(value, valueExpression)

  /*
    添加el.model对象
    {
      value: "(test['test1'][test2])", 
      expression: JSON.stringify(test['test1'][test2]),
      callback: callback ($$v){ 
        $set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))
      }
    }
  */
  el.model = {
    value: `(${value})`,
    expression: JSON.stringify(value),
    callback: `callback (${baseValueExpression}) {${assignment}}`
  }
}

/**
 * Cross-platform codegen helper for generating v-model value assignment code.
 */
// 生成一段字符代码，是为v-model绑定的变量进行赋值
export function genAssignmentCode (
  value: string, //v-model绑定的值
  assignment: string
): string {
  // 处理绑定的值，返回为对象
  const res = parseModel(value)
  if (res.key === null) {
    // 如果key为null，说明绑定的值为简单的字符  "xxx=$event.target.value"  (xxx为v-model绑定的值)
    return `${value}=${assignment}`
  } else {
    // 否则绑定的值比较复杂
    // 以test['test1'][test2]为例
    // 返回的字符为"$set(test['test1'] ,test2, $event.target.value)"
    // 这里也就解释了为什么v-model绑定的对象是响应式的，因为使用了$set进行赋值
    return `$set(${res.exp}, ${res.key}, ${assignment})`
  }
}

/**
 * Parse a v-model expression into a base path and a final key segment.
 * Handles both dot-path and possible square brackets.
 *
 * Possible cases:
 *
 * - test
 * - test[key]
 * - test[test1[key]]
 * - test["a"][key]
 * - xxx.test[a[a].test1[key]]
 * - test.xxx.a["asa"][test1[key]]
 *
 */

/*
解析v-model绑定值，处理绑定值中的点路径和可能的方括号
如下
- test
- test[key]
- test[test1[key]]
- test["a"][key]
- xxx.test[a[a].test1[key]]
- test.xxx.a["asa"][test1[key]]

处理v-model绑定的值，绑定的值中会存在点路径或者方括号，因为需要对v-model绑定的变量使用$set进行响应式处理
$set(target, key, value)
需要把key从绑定的变量提取出来
*/
let len, str, chr, index, expressionPos, expressionEndPos

type ModelParseResult = {
  exp: string,
  key: string | null
}

export function parseModel (val: string): ModelParseResult {
  // Fix https://github.com/vuejs/vue/pull/7730
  // allow v-model="obj.val " (trailing whitespace)
  val = val.trim() //去掉首尾空格
  len = val.length

  // 如果[不存在或者]不在字符的最后一个位置
  // 比如test.prop.key  或者  test['prop'].key
  if (val.indexOf('[') < 0 || val.lastIndexOf(']') < len - 1) {
    // 找到最后一个点字符的索引
    index = val.lastIndexOf('.')
    if (index > -1) {
      /*
         如果找到了，以下面为例
         test['prop'].key
         返回一个对象
         {
           exp:"test['prop']",
           key:"key"
         }
      */
      return {
        exp: val.slice(0, index),
        key: '"' + val.slice(index + 1) + '"'
      }
    } else {
      /*
          如果没找到点字符，说明没有使用点路径或者方括号 v-model="test"
          {
            exp:"test",
            key:null
          }
      */
      return {
        exp: val,
        key: null
      }
    }
  }

  str = val
  index = expressionPos = expressionEndPos = 0
  /*
    以test["test1"][test2[b]]为例
    注意test2[b]是没有用""括起来的,说明这是一个变量
  */
  // 遍历字符的每一个字符
  while (!eof()) {
    // 获取字符的Unicode编码
    chr = next()
    /* istanbul ignore if */
    if (isStringStart(chr)) {
      // 如果是"或者',
      // 调用parseString继续遍历
      parseString(chr)
    } else if (chr === 0x5B) {
      // 如果是[,调用parseBracket继续遍历
      parseBracket(chr)
    }
  }

  /*
    最后返回一个对象
    {
      exp:test["test1"],
      key:test2[b]
    }
  */
  return {
    exp: val.slice(0, expressionPos),
    key: val.slice(expressionPos + 1, expressionEndPos)
  }
}

function next (): number {
  /*
    返回索引字符的Unicode编码,index加一
    // "为34  39 === 0x22
    // '为39  39 === 0x27
    // [为91  91 === 0x5B
    // ]为93  93 === 0x5D
  */
  return str.charCodeAt(++index)
}

// 循环的判断条件
function eof (): boolean {
  // 索引和字符串长度比较，如果索引大于或等于返回真
  return index >= len
}

//如果是 " 或者 ' 的时候返回真
function isStringStart (chr: number): boolean {
  return chr === 0x22 || chr === 0x27
}

/*
继续遍历字符，记录方括号内字符的开始索引和结束索引,
因为碰到一对方括号，parseBracket就会被调用，
所以expressionPos和expressionEndPos记录的是最后一对方括号内字符的开始索引和结束索引
*/ 
function parseBracket (chr: number): void {
  // 表示方括号的层级
  let inBracket = 1
  // 方括号开始的索引
  expressionPos = index
  while (!eof()) {
    chr = next()
    if (isStringStart(chr)) {
      parseString(chr)
      continue
    }
    // 碰到一个[, inBracket加一
    if (chr === 0x5B) inBracket++
    // 碰到一个], inBracket减一
    if (chr === 0x5D) inBracket--

    // 如果inBracket为0，说明该字符不在方括号内了
    if (inBracket === 0) {
      // 方括号结束的索引
      expressionEndPos = index
      break
    }
  }
}

function parseString (chr: number): void {
  // 从"字符继续遍历
  const stringQuote = chr
  while (!eof()) {
    chr = next()
    if (chr === stringQuote) {
      // 匹配到了"凑成一对退出该循环
      break
    }
  }
}
