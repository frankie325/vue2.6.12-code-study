# 解析HTML模板

## parseHTML中用到的正则

### attribute
```js
/*
匹配标签的属性（包括vue的指令）,获取属性
比如
id  =  "container"
id='container' 
id=container 
v-if="xxx"
v-on:click="xxx"
@click="xxx"

id="abc".match(attribute)
使用match匹配返回的数组
["id='abc'", "id", "=", undefined, "abc", undefined, index: 0, input: "id='abc'", groups: undefined]
索引0为整个匹配到的字符，索引1为分组捕获的key，索引3,4,5的位置为分组捕获的属性值（其中一个会有值）
*/ 
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
```

拆分来看
1. ```^\s*```  
匹配多个空字符串,key值前面的空格
2. ```([^\s"'<>\/=]+)```  
（、代表或）匹配非 空、"、'、<、>、/、=的字符一个或多个。主要会匹配到属性的key部分。
3. ```(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?```
   - ```(?:  )```  
表示分组不捕获
   - ```\s*(=)\s*```   
匹配等于号，包括等于号边上的空格
   - ```"([^"]*)"+```   
或者匹配双引号，以及双引号中间的多个非双引号字符，即属性值部分
   - ```|'([^']*)'+```  
或者匹配单引号，以及单引号中间的多个非单引号字符，即属性值部分
   - ```|([^\s"'=<>`]+)```  
或者匹配非 空、"、'、=、<、>、`的字符一个或多个，即属性值部分，（属性值可以省略引号直接使用）

### dynamicArgAttribute
```js
/*
动态参数值的匹配
v-bind:[attributeName]="attr"
:[attributeName]  =  "attr"
v-on:[eventName].once="doSomething"
@[eventName]  =  "doSomething"

像这样v-on:click = "doSomething" 没有动态绑定的不会匹配到


‘v-bind:[attributeName].sync="attr"’.match(dynamicArgAttribute)
使用match匹配返回的数组
["v-bind:[attributeName].sync=\"attr\"", "v-bind:[attributeName].sync", 
"=", "attr", undefined, undefined, index: 0, input: "v-bind:[attributeName]=\"attr\"",
 groups: undefined]
索引1为整个匹配到的字符，索引2为分组捕获的key，索引3,4,5的位置为分组捕获的属性值（其中一个会有值）
*/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
```
1. ```^\s*```  
匹配多个空字符串,key值前面的空格
2. ```((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)```
   -  ```(?:v-[\w-]+:|@|:|#)```
匹配（v-和（字母数字下划线、短横线一次或多次）和冒号）、@、:、#。即v-指令以及对应的简写形式，也可以是自定义指令
   - ```\[[^=]+?\]```
匹配[ 和非等于字符一次或多次，但尽可能少的重复和 ]。即动态属性值部分[attributeName]
   - ```[^\s"'<>\/=]*```  
匹配非 空、"、'、<、>、/、=的字符一个或多个。即修饰符部分
3. ```(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?```  
与普通属性后面部分一样

### startTagOpen
```js
// 匹配以字母/下划线开头后面跟着反斜杠、横线、点、数字、字母，匹配不包含冒号(:)的 XML 名称一个或多个
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
// 匹配合法的XML标签（xml:xxx）
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 匹配开始标签的内容，比如<div></div>的话会匹配到 <div 或 <xml:xxx 的标签
const startTagOpen = new RegExp(`^<${qnameCapture}`)
```
### startTagClose
```js
/*
 匹配开始标签的结束，反括号
 1.一元开始标签的结束   " />".match(startTagClose)返回的数组
 [" />", "/", index: 0, input: " />", groups: undefined]
 2.普通开始标签的结束   " >".match(startTagClose)返回的数组
 [" >", "", index: 0, input: " >", groups: undefined]
*/
const startTagClose = /^\s*(\/?)>/
```
### endTag
```js
// 匹配整个结束标签，match返回的结果 ['</div>','div']
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
```
### doctype
```js
// 匹配<!DOCTYPE> 声明标签
const doctype = /^<!DOCTYPE [^>]+>/i
```
### comment
```js
// 匹配 <!-- 注释文本
const comment = /^<!\--/
```
### conditionalComment
```js
// 匹配条件注释，如<![if IE]> html代码 <![endif]>
const conditionalComment = /^<!\[/
```
### encodedAttr
```js
// 匹配<或者>或者"或者&或者'的编码
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
```
### encodedAttrWithNewLines
```js
// 匹配<或者>或者"或者&或者'或者\n（换行符）或者\t（tab键）的编码
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g
```

## parseHTML用到的一些方法和变量
```js
// 检查是不是纯标签标签内容
export const isPlainTextElement = makeMap('script,style,textarea', true)
// 缓存创建的正则
const reCache = {}
// 解码用到
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}

// #5992
// 判断是否是pre标签或者textarea标签
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
// 如果是pre和textarea标签，且html第一个字符是换行符，则为true
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 对属性值进行解码
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  // 匹配到的字符进行解码，并替换掉该字符
  return value.replace(re, match => decodingMap[match])
}
```
## parseHTML
:::tip 文件目录
/src/compiler/parser/html-parser.js
:::
一些常量
```js
export function parseHTML (html, options) {
  // 存储匹配的开始标签
  const stack = []
  const expectHTML = options.expectHTML
  // 判断是否是一元标签
  const isUnaryTag = options.isUnaryTag || no
  // 判断是不是非一元标签，却可以自己补全并闭合的标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 记录当前在原始 html 字符串中的开始位置
  let index = 0
  // last保存当前循环未处理时的html，用来判断html是否产生了变化
  // lastTag保存stack的栈顶元素的名称
  let last, lastTag
```
进入while循环，while循环里对HTML字符进行解析，解析掉一段字符，则调用```advance```将其剔除，html逐变短，直到变成空字符，解析完毕，停止循环
```js
// 循环html模板字符串
while (html) {
   // 记录每次循环还没被处理时的字符
   last = html
```
非纯文本标签进入该if语句
```js
   //确保不是在 script、style、textarea 这样的纯文本元素中
   if (!lastTag || !isPlainTextElement(lastTag)) {
      // 拿到<的索引
      let textEnd = html.indexOf('<')
```
### 左尖括号索引为0时
拿到<左尖括号的索引，索引为0的情况，可能是
- ```<!--```注释标签
- ```<![if !IE]>```条件注释标签
- ```<!DOCTYPE html>```标签
- ```<xxx>```开始标签
- ```<xxx/>```结束标签
```js
      // 第一个字符是<（尖括号），比如html="<div>xxx<div/>"
      if (textEnd === 0) {
        // Comment:
        // 如果是<!-- 注释文本
        if (comment.test(html)) {
          // 拿到注释标签的结束索引，为第一个短横线的索引
          const commentEnd = html.indexOf('-->')
          if (commentEnd >= 0) {
            // 如果结束索引存在
            if (options.shouldKeepComment) {
              // 如果需要保留注释
              // 调用comment，将注释内容，开始结束索引传递进去
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 更新html模板字符串
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
         /*
          如果是条件注释标签
          <![if !IE]>
          <link href="non-ie.css" rel="stylesheet">
          <![endif]>
        */ 
        if (conditionalComment.test(html)) {
          // 拿到结束位置索引
          const conditionalEnd = html.indexOf(']>')
          if (conditionalEnd >= 0) {
            // 如果索引存在，更新索引
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // 如果是<!DOCTYPE html>
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          // 更新html
          advance(doctypeMatch[0].length)
          continue
        }

        // 如果是结束标签
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          // 结束标签的开始索引
          const curIndex = index
          // 更新html
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // 如果是开始标签
        // parseStartTag返回一个解析的对象，没有则返回undefined
        const startTagMatch = parseStartTag()
        // 如果parseStartTag返回了match对象
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            /*
                如果开始标签是pre标签，且html第一个字符是换行符，把换行符去掉
                比如： template: `<pre    id='xxx'>
                {{msg}}</pre>`,这样的模板，匹配完开始标签后，html为"\n{{msg}}</pre>"，
                剔除换行符
             */ 
            advance(1)
          }
          continue
        }
      }
```

### 左尖括号索引大于等于0时
- ```<文本内容<div/>```文本节点开头包含<，虽然以<开头，但是上面5中情况都没成立
- ```文本内容<文本内容```文本节点中包含<
```js
      let text, rest, next
      // <的索引不在第一个位置，比如
      //情况1.  html="文本<h1>xxx</h2><div/>"
      //情况2.  html="文本1<文本2<h1>xxx<h2><div/>" 
      /*
       情况3.  html="aaa<bbb<h1>xxx<h2><div/>"
       如果文本1和文本2换成英文，进入下面的while循环时，碰到<bbb开头会被当成开始标签，停止循环
       进入下轮html模板循环，进入开始标签的解析,但又不是HTML标签
       会从html中剔除，所以页面只会渲染aaa文本
      */
      if (textEnd >= 0) {
        // 获取<符号后面的内容，包括<符号
        rest = html.slice(textEnd)
        //情况1.  rest="<h1>xxx</h2><div/>"
        //情况2.  rest="<文本2<h1>xxx<h2><div/>"
        //情况1不会进入while循环
        while (
          !endTag.test(rest) && //开头没有匹配到结束标签
          !startTagOpen.test(rest) && //开头没有匹配到开始标签
          !comment.test(rest) &&//开头没有匹配到注释
          !conditionalComment.test(rest)//开头没有匹配到条件注释
        ) {
          // 满足上面的条件，则进入循环
          // < in plain text, be forgiving and treat it as text
          // 继续寻找<符的索引，跳过第一个字符开始找
          next = rest.indexOf('<', 1)
          // 没找到就跳出循环
          if (next < 0) break
          // 更新textEnd索引
          textEnd += next
          // 情况2. rest = <h1>xxx<h2><div/>
          rest = html.slice(textEnd)
        }
        // 取得文本内容
        //情况1.  text="文本"
        //情况2.  text="文本1<文本2"
        text = html.substring(0, textEnd)
      }
```
### 左尖括号索引没找到时
```js
      // 没有匹配到<符号
      if (textEnd < 0) {
        // html就是纯文本
        text = html
      }

      if (text) {
        // 如果文本存在，更新html
        advance(text.length)
      }

      if (options.chars && text) {
        // 调用options.chars
        options.chars(text, index - text.length, index)
      }
```
纯文本标签的内容```script,style,textarea```进入else条件
```js
   } else {
      // 如果是纯文本标签<textarea>xxx</textarea>
      // 先匹配到开始标签，lastTag = textarea。下次while循环才会进入到该条件
      let endTagLength = 0// 纯文本结束标签的长度
      // 纯文本标签转为小写
      const stackedTag = lastTag.toLowerCase()
      // 创建一个正则表达式，并存入缓存
      // ([\\s\\S]*?)  匹配任意字符
      // </' + stackedTag + '[^>]*>)  匹配纯文本标签的结束标签
      // reStackedTag 的作用是用来匹配纯文本标签的内容以及结束标签的
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))

      // 比如xxx</textarea>bbb,文本内容和结束标签被替换为空字符，rest就是剩下的内容bbb
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        // 其中参数 all 保存着整个匹配的字符串，即：xxx</textarea>。
        // 参数 text 为第一个捕获组的值，也就是纯文本标签的内容，即：xxx。
        // 参数 endTag 保存着结束标签，即：</textarea>。

        endTagLength = endTag.length//结束标签的长度
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }

        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          // 忽略<pre> 标签和 <textarea> 标签的内容中的第一个换行符
          text = text.slice(1)
        }
        if (options.chars) {
          // 调用options.chars
          options.chars(text)
        }
        // 返回的值为替换的字符
        return ''
      })

      // 更新index为替换
      index += html.length - rest.length
      // html更新为剩余的值
      html = rest
      // 解析结束标签，传入结束标签的开始索引和结束索引
      parseEndTag(stackedTag, index - endTagLength, index)
   }
```
如果循环末尾，html和last值还相等，说明没有进入上面的一系列处理，是纯文本
```js
   if (html === last) {
      // html如果与上轮循环处理结果相同，说明是纯文本
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
   }
```
```js
   // 调用parseEndTag，处理stack栈中剩余的标签（这种情况一般是当根标签没写结束标签时）
   parseEndTag()
```
### advance
```js
// 重置html模板字符串和更新index索引位置
   function advance (n) {
    // index为每次截取之后的，html模板字符串的开始索引
    // 即index索引为没被截取时，在初始html模板字符串的索引位置
    index += n
    // 截取从n索引开始以及后面的字符串，重新赋值给html
    html = html.substring(n)
   }
```
### parseStartTag
解析开始标签以及里面的属性
```js
   function parseStartTag () {
    // 匹配开始标签 比如<div>xx</div>
    // 返回一个数组 ["<div","div"]
    const start = html.match(startTagOpen)
    if (start) {
      // 定义一个变量
      const match = {
        tagName: start[1], //存储标签的名称
        attrs: [], //用来存储将来被匹配到的属性
        start: index // 该标签在html模板中的开始索引
      }
      // 更新html
      advance(start[0].length)
      let end, attr
      /*
        attr存储match匹配返回的数组
        2个条件进入循环，循环匹配属性
        1.还没有匹配到开始标签的结束部分
        2.匹配到属性(vue动态参数属性或者普通属性)，同时attr赋值为match返回的数组
        匹配到开始标签的结束部分就结束循环
      */
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        // 属性的开始索引
        attr.start = index
        // 更新html
        advance(attr[0].length)
        // 属性的结束索引
        attr.end = index
        // 将属性推入到attrs数组中
        match.attrs.push(attr)
      }

      // 如果end为true,说明存在开始标签的结束部分
      if (end) {
        // end[1]存在值则说明为一元标签
        match.unarySlash = end[1]
        // 更新html
        advance(end[0].length)
        // 开始标签结束位置的索引
        match.end = index
        // 返回该match对象
        return match
      }
    }
   }
```

### handleStartTag
进一步处理```parseStartTag```的解析结果，```match```对象
```js
   function handleStartTag (match) {
    // 拿到标签名
    const tagName = match.tagName
    // 拿到unarySlash。可用来判断是不是一元标签
    const unarySlash = match.unarySlash

    if (expectHTML) {
      /*
       上一个匹配的开始标签是p标签，且当前匹配的开始标签是非短语标签
       比如：<p><h1></h1></p> ，浏览器会转化为 <p></p><h1></h1><p></p>
       所以解析器也需要和浏览器保持一致
       */
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        // 关闭上一个标签，也就是p标签
        parseEndTag(lastTag)
      }
      /*
      比如
      <p>one
      <p>two
      如果当前标签是可以省略结束标签的标签，且上一个开始标签与当前开始标签一样
      会立即关闭当前标签，因为当前标签还没有推入到stack中，所以实际上关闭的是上一个标签
      */
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 判断是不是一元标签，通过options中的isUnaryTag或者解析得到的结果进行判断
    // 对于<my-component />自定义的组件标签也是一元标签，
    // isUnaryTag无法判断自定义组件的标签名是不是一元标签
    // 所以使用使用解析的结果就可以知道是不是一元标签
    const unary = isUnaryTag(tagName) || !!unarySlash

    // 存储属性数组的长度
    const l = match.attrs.length
    const attrs = new Array(l)
    // 遍历match.attrs
    for (let i = 0; i < l; i++) {
      // 拿到每个元素
      const args = match.attrs[i]
      // 拿到每个attr的属性值
      const value = args[3] || args[4] || args[5] || ''
      // 如果标签是a标签且属性的key是href属性，根据shouldDecodeNewlinesForHref判断是不是要解码
      // 否则根据options.shouldDecodeNewlines判断是不是要解码
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      // 重新为每个attr赋值,变成了对象
      attrs[i] = {
        name: args[1], //attr的key值（等于号左边的字符）
        value: decodeAttr(value, shouldDecodeNewlines) //attr的属性值（等于号右边的字符）
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        // 属性开始索引   为什么要加上后面这部分？
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        // 属性结束索引
        attrs[i].end = args.end
      }
    }

    if (!unary) {
      // 如果不是一元标签
      // 推到stack数组中
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      // 将lastTag设为该标签名
      lastTag = tagName
    }

    if (options.start) {
      // 如果选项中存在start函数，调用
      // 并将开始标签的名字 tagName ，格式化后的属性数组 attrs ，是否为一元标签 unary ，
      // 以及开始标签在原 html 中的开始和结束位置match.start 和 match.end 作为参数传递
      options.start(tagName, attrs, unary, match.start, match.end)
    }
   }
```
### parseEndTag
```js
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    // start,end没传为undefined，undefined==null为true。赋值为当前字符流的开始位置
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 如果tagName存在
    if (tagName) {
      // 标签名转为小写
      lowerCasedTagName = tagName.toLowerCase()
      // 从后往前遍历stack，匹配栈中小写标签名。没匹配到pos为-1
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          // 当找到对应位置时，跳出循环，索引保存在pos中
          break
        }
      }
    } else {
      // 如果调用parseEndTag时没有传递参数，tagName不存在，pos设置为0
      // 用来处理stack栈中剩余的没被处理掉的元素
      pos = 0
    }

    // pos如果大于等于0
    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 从后往前遍历stack，遍历到pos停止
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          // 如果stack数组的索引大于pos，则说明该标签缺少闭合索引，报警告
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        if (options.end) {
          // 调用options.end
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 更新stack栈，剔除匹配到的开始标签以及之后的元素
      stack.length = pos
      // 更新lastTag
      lastTag = pos && stack[pos - 1].tag

      // 进入下面的else if说明没在stack中匹配到，pos为-1
    } else if (lowerCasedTagName === 'br') {
       // 当前处理的闭合标签为 </br> 标签
      if (options.start) {
        options.start(tagName, [], true, start, end)// 第三个参数true，说明为一元标签
      }
    } else if (lowerCasedTagName === 'p') {
       // 当前处理的闭合标签为 </p> 标签
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
```