# 解析属性生成AST

## parse中用到的正则
### onRE
```js
// 匹配@或者v-on
export const onRE = /^@|^v-on:/;
```
### dirRE
```js
// process.env.VBIND_PROP_SHORTHAND表示当前环境是否支持.prop修饰符的简写形式，
// 如:text-content.prop="text"可简写成.text-content
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/  //匹配以v-或@或:或.或#字符开头
  : /^v-|^@|^:|^#/; //匹配以v-或@或:或#字符开头
```
### forAliasRE
```js
/*
  ([\s\S]*?) [\s\S]的意思是匹配任意字符。*?意思是重复任意次，但尽可能少的重复
  (?:in|of)  分组不捕获，匹配in或者of
  ([\s\S]*)  匹配任意字符，0次或多次
  比如"(obj,index) of list".match(forAliasRE)
  返回["(obj,index) of list", "(obj,index)", "list", index: 0, input: "(obj,index) of list", groups: undefined]
*/
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
```
### forIteratorRE
```js
/*
  ,([^,\}\]]*) 匹配逗号和非逗号，非}，非]0次或多次
  (?:,([^,\}\]]*))?  整体出现0到1次，最外层的分组不捕获，里面的分组和上面一样
   该正则用来匹配 forAliasRE 第一个捕获组所捕获到的字符串
   比如"value, key, index".match(forIteratorRE)
   返回[", key, index", " key", " index", index: 5, input: "value, key, index", groups: undefined]
*/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
```
### stripParensRE
```js
/*
匹配以字符 ( 开头，要么以字符 ) 结尾的字符串
在使用forIteratorRE之前,stripParensRE用来匹配(obj, index)中的( )进行删除
*/
const stripParensRE = /^\(|\)$/g;
```
### dynamicArgRE
```js
//匹配方括号以及内部的除换行符号的字符，即v-bind:[xxx]=""使用了动态属性的方括号
const dynamicArgRE = /^\[.*\]$/;
```
### argRE
```js
// 匹配以:和0个或多个除换行符以外的字符的结尾
const argRE = /:(.*)$/;
```
### bindRE
```js
// 匹配以:或者.或者v-bind:开头
export const bindRE = /^:|^\.|^v-bind:/;
```
### propBindRE
```js
// 匹配以点字符开头，用来匹配.prop修饰符的简写情况
const propBindRE = /^\./;
```
### modifierRE
```js
/*
    1.\.匹配点符号
    2.[^.\]]+ 匹配非点符号或者非右方括号一次或多次
    3.[^\]] 匹配非方括号结尾的任意字符0次或多次
    \.[^.\]]+(?=[^\]]*$)   exp1(?=exp2)则表示前瞻断言， 查找括号内表达式前面的表达式，括号内的表达式只是表示一个位置
    就是匹配连续的.xxx.xxx.xxx修饰符
    ".abc.def.ghi".match(modifierRE)
    输出[".abc", ".def", ".ghi"]
*/ 
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g;
```
### slotRE
```js
// 匹配以v-slot:开头或者只有v-slot字符或者以#字符开头
const slotRE = /^v-slot(:|$)|^#/;
```
### lineBreakRE
```js
// 匹配回车符或者换行符
const lineBreakRE = /[\r\n]/;
```
### whitespaceRE
```js
// 匹配空格或换页符或水平制表符（tab键）或回车符或换行符一次或多次
const whitespaceRE = /[ \f\t\r\n]+/g;
```
### invalidAttributeRE
```js
// 验证属性是否有效，匹配到空、"、'、<、>、/、=符号
const invalidAttributeRE = /[\s"'<>\/=]/;
```
## parse
:::tip 文件目录
/src/compiler/parser/index.js
:::
parse中的函数太长，调用的处理属性的函数很多，先看下简化的结构
```js
// configurable state
export let warn: any;
let delimiters;
let transforms;
let preTransforms;
let postTransforms;
let platformIsPreTag;
let platformMustUseProp;
let platformGetTagNamespace;
let maybeComponent;

parse(template ,options){
  // 用来抛出错误的函数
  warn = options.warn || baseWarn;
  // 判断是否是pre标签
  platformIsPreTag = options.isPreTag || no;
  // 判断属性是不是要用props进行绑定
  platformMustUseProp = options.mustUseProp || no;
  // 获取标签的命名空间
  platformGetTagNamespace = options.getTagNamespace || no;
  // 判断是不是保留标签（html + svg)
  const isReservedTag = options.isReservedTag || no;

  // 判断标签是不是组件标签
  maybeComponent = (el: ASTElement) =>
    !!(
      el.component || //el.component为true，则是组件标签
      el.attrsMap[":is"] || //标签上动态绑定了属性is，则是组件标签
      el.attrsMap["v-bind:is"] ||
      //没有动态绑定is属性，则判断静态属性is
      // 如果is存在，判断is是不是保留属性，是则说明不是组件标签
      // is不存在，则判断标签名是不是保留属性，是则说明不是组件标签
      !(el.attrsMap.is ? isReservedTag(el.attrsMap.is) : isReservedTag(el.tag))
    );

  // 中置处理，transforms = [transformNode , transformNode] 
  transforms = pluckModuleFunction(options.modules, "transformNode");
  // 前置处理，preTransforms = [ preTransformNode ] 
  preTransforms = pluckModuleFunction(options.modules, "preTransformNode");
  // 后置处理，暂时为空数组，当有需要的时候可以使用
  postTransforms = pluckModuleFunction(options.modules, "postTransformNode");

  // 界定符，即插值表达式
  delimiters = options.delimiters;

  const stack = [];

  // 告诉编译器在编译 html 字符串时是否放弃标签之间的空格，只要options.preserveWhitespace不为 false，就为真
  const preserveWhitespace = options.preserveWhitespace !== false;
  const whitespaceOption = options.whitespace;
  // AST对象
  let root;
  let currentParent;
  // inVPre说明正在解析的标签是包含v-pre标签的子标签
  let inVPre = false;
  // inPre说明正在解析的标签是pre标签的子标签
  let inPre = false;

  let warned = false;

  // 警告一次
  function warnOnce(msg, range) {/*...*/}
  // 关闭标签
  function closeElement(element) {/*...*/}
  // 用来删除标签内尾随的空白字符节点
  function trimEndingWhitespace(el) {/*...*/}
  // 检查根标签是否符合条件
  function checkRootConstraints(el) {/*...*/}

  parseHTML(template,{
    warn,
    // 一些编译选项
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    // 是否保留注释，用户传入的参数
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    //处理开始标签  
    start(){/*...*/},
    //处理结束标签  
    end(){/*...*/},
    //处理文本节点  
    chars(){/*...*/},
    //处理注释节点  
    comment(){/*...*/},
  })
  return root
}
```

### start
```js
   //处理开始标签
    start(tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      // 检查命名空间，如果currentParent存在，则继承父级标签的命名空间，否则调用options.getTagNamespace获取命名空间
      const ns =
        (currentParent && currentParent.ns) || platformGetTagNamespace(tag);

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === "svg") {
        // 如果是IE环境且是svg标签，处理IE的bug
        attrs = guardIESVGBug(attrs);
      }
      // 创建当前标签的AST对象
      let element: ASTElement = createASTElement(tag, attrs, currentParent);
      if (ns) {
        // 如果存在命名空间，往AST对象上添加ns属性，为命名空间
        element.ns = ns;
      }

      if (process.env.NODE_ENV !== "production") {
        if (options.outputSourceRange) {
          // 非生产环境下，往AST对象上添加，start，end，rawAttrsMap属性
          // 开始索引
          element.start = start;
          // 结束索引
          element.end = end;
          // 遍历attrsList，转为对象形式
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            // 第一次执行回调时，cumulated为空对象，以后每次回调的cumulated值为上传回调返回的值
            // 将attr添加到cumulated中
            cumulated[attr.name] = attr;
            return cumulated;
          }, {});
        }
        attrs.forEach((attr) => {
          if (invalidAttributeRE.test(attr.name)) {
            // 匹配到空、"、'、<、>、/、=符号
            // 匹配到无效的属性key，报错
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
                `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length,
              }
            );
          }
        });
      }

      if (isForbiddenTag(element) && !isServerRendering()) {
        // 非服务端渲染且是模板禁止使用的标签
        // 添加forbidden属性
        element.forbidden = true;
        process.env.NODE_ENV !== "production" &&
          warn(
            "Templates should only be responsible for mapping the state to the " +
              "UI. Avoid placing tags with side-effects in your templates, such as " +
              `<${tag}>` +
              ", as they will not be parsed.",
            { start: element.start }
          );
      }

      // 前置处理
      for (let i = 0; i < preTransforms.length; i++) {
        // 使用前置处理得到的新的AST对象，否则还是使用原来的AST对象
        element = preTransforms[i](element, options) || element;
      }

      if (!inVPre) {
        // 处理v-pre指令
        processPre(element);
        if (element.pre) {
          // 存在v-pre指令，将inVPre置为true
          inVPre = true;
        }
      }
      if (platformIsPreTag(element.tag)) {
        // 如果是pre标签，inPre为true
        inPre = true;
      }
      if (inVPre) {
        // 如果是v-pre环境中，调用processRawAttrs处理v-pre指令
        processRawAttrs(element);
      } else if (!element.processed) {
        // 如果没有被前置处理过，才进入该条件，避免重复解析
        // structural directives 结构化指令 v-for、v-if/v-else-if/v-else、v-once等
        // 解析v-for
        processFor(element);
        // 解析v-if
        processIf(element);
        // 解析v-once
        processOnce(element);
      }

      if (!root) {
        // 如果root变量还没值，将该标签赋值给root
        root = element;
        if (process.env.NODE_ENV !== "production") {
          // 检查根标签
          checkRootConstraints(root);
        }
      }

      // 如果不是一元标签
      if (!unary) {
        // currentParent 变量的值更新为当前元素
        // currentParent 始终存储的是 stack 栈顶的元素，即当前解析元素的父级
        currentParent = element;
        // 将当前元素推入到stack栈中
        stack.push(element);
      } else {
        // 一元标签
        closeElement(element);
      }
    },
```

### end
```js
 //处理结束标签
    end(tag, start, end) {
      // 拿到stack栈顶的元素，即当前结束标签对应的开始标签的AST对象
      const element = stack[stack.length - 1];
      // pop stack
      // stack长度减一
      stack.length -= 1;
      // 更新currentParent，指向新的栈顶
      currentParent = stack[stack.length - 1];
      if (process.env.NODE_ENV !== "production" && options.outputSourceRange) {
        // 标签的结束索引
        element.end = end;
      }
      closeElement(element);
    },
```
### chars
```js
// 处理文本节点
    chars(text: string, start: number, end: number) {
      if (!currentParent) {
        // currentParent不存在，说明该节点是根节点
        if (process.env.NODE_ENV !== "production") {
          if (text === template) {
           /*
            <template>
              我是文本节点
            </template>
           text如果等于template，说明模板内只有文本节点，报错
           */
          // 
            warnOnce(
              "Component template requires a root element, rather than just text.",
              { start }
            );
          } else if ((text = text.trim())) {
            /*
              <template>
                <div>根元素内的文本节点</div>根元素外的文本节点
              </template>
              currentParent不存在且存在文本节点，说明该文本在根元素的外面，报错
            */ 
            warnOnce(`text "${text}" outside root element will be ignored.`, {
              start,
            });
          }
        }
        // currentParent不存在，直接返回，不往下执行
        return;
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      /*
        解决textarea标签在IE的bug
        <textarea placeholder="some placeholder..."></textarea>
        空的textarea文本内容，IE会渲染将placeholder的内容渲染成文本节点
        <textarea placeholder="some placeholder...">some placeholder...</textarea>
      */
      if (
        isIE &&
        currentParent.tag === "textarea" &&
        currentParent.attrsMap.placeholder === text
      ) {
        // 当 <textarea> 标签没有真实文本内容时才存在这个 bug，所以这说明当前解析的文本节点原本就是不存在的
        // 直接返，回不往下执行
        return;
      }


      const children = currentParent.children;
      if (inPre || text.trim()) {
        /*
        <div>&lt;div&gt;我是一个DIV&lt;/div&gt;</div>
        对于文本中的实体字符，浏览器会自动解析，而vue使用document.createTextNode创建文本节点，
        不会解析文本中的实体字符，需要预先解码

        如果是script和style标签，则不对文本进行解码
        */
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text);

      // 没走进这个if条件，说明不在pre标签内，且text.trim()为false,文本都是一些换行符回车符之类的空文本，
      //下面的一些else if条件就是处理这些情况的
      } else if (!children.length) {
        /*
          <div>       <p>p标签</p></div>
          解析这样的空文本时，此时div还没有子标签
          将text置空
        */
        // remove the whitespace-only node right after an opening tag
        text = "";
      } else if (whitespaceOption) {
        // 存在whitespace选项
        if (whitespaceOption === "condense") {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          // 如果whitespaceOption为condense，开启压缩，
          // 如果包含换行符或回车符，text赋值为""，否则为" "
          text = lineBreakRE.test(text) ? "" : " ";
        } else {
          // 没压缩则为" "
          text = " ";
        }
      } else {
        // 存在preserveWhitespace选项，text为" ",否则为"""
        text = preserveWhitespace ? " " : "";
      }

      
      // text为真，说明text不是""  (注意" "为true)
      if (text) {
        if (!inPre && whitespaceOption === "condense") {
          // 非pre标签内，且开启了压缩
          // 将文本内的空文本替换成" "
          text = text.replace(whitespaceRE, " ");
        }
        let res;
        let child: ?ASTNode;

        // 1.不在v-pre指令内
        // 2.或不是空格字符
        // 3.或使用parseText解析文本成功
        // 则进入该if语句，创建类型为2的文本节点描述对象
        if (!inVPre && text !== " " && (res = parseText(text, delimiters))) {

          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text,
          };


        //不满足上面的if条件，继续判断 
        // 1.不是空格字符
        // 2.或父标签没有子节点
        // 3.或父标签最后一个节点不是空格字符
        // 则进入该else if语句，创建类型为3的普通文本节点描述对象
        } else if (
          text !== " " ||
          !children.length ||
          children[children.length - 1].text !== " "
        ) {

          child = {
            type: 3,
            text,
          };

        }

        if (child) {
          if (
            process.env.NODE_ENV !== "production" &&
            options.outputSourceRange
          ) {
            // 添加文本的开始索引和结束索引
            child.start = start;
            child.end = end;
          }
          // 推入到父标签的children中
          children.push(child);
        }
      }
    },
```
### comment
```js
//处理注释节点 
    comment(text: string, start, end) {
      // adding anything as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      // 如果 currentParent 不存在，说明注释和 root 为同级，忽略
      if (currentParent) {
        // 注释节点的AST
        const child: ASTText = {
          // 节点类型
          type: 3,
          // 注释内容
          text,
          // 是否为注释
          isComment: true,
        };
        if (
          process.env.NODE_ENV !== "production" &&
          options.outputSourceRange
        ) {
          // 记录节点的开始和结束索引
          child.start = start;
          child.end = end;
        }
        // 将当前注释节点放到父元素的 children 属性中
        currentParent.children.push(child);
      }
    },
```
### closeElement
```js
  // 两个地方调用closeElement，处理一元标签和结束标签
  function closeElement(element) {
    // 删除尾随空白符
    trimEndingWhitespace(element);
    if (!inVPre && !element.processed) {
      // 不在v-pre环境内且没有被前置处理过，调用processElement处理众多属性
      element = processElement(element, options);
    }
    /*
      <template>
          <div v-if="show">div1</div>
          <div v-else>div2</div>
      </template>
      当解析到第二个div的结束标签时，满足下列条件
      stack长度为0且该元素不是根标签
    */
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        // 根标签存在v-if，且该标签存在v-else或v-if-else
        if (process.env.NODE_ENV !== "production") {
          // 检查该元素作为根标签时，是否符合条件
          checkRootConstraints(element);
        }
        // 往根标签上添加该元素的elseif条件，并指向该元素
        addIfCondition(root, {
          exp: element.elseif,
          block: element,
        });
      } else if (process.env.NODE_ENV !== "production") {
        // 如果走到这，说明存在多个根节点，报错，应该将 v-if、v-else-if 一起使用，保证组件只有一个根元素
        warnOnce(
          `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`,
          { start: element.start }
        );
      }
    }

    // currentParent还存在，即还在解析根节点内的标签
    // 且该标签不是在模板内禁止使用的
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        // 如果该标签存在v-else-if或者v-else，调用processIfConditions
        // v-else-if或者v-else的标签不会推入到他们父标签的children属性中
        processIfConditions(element, currentParent);
      } else {
        // 处理作用域插槽
        if (element.slotScope) {
          // 2.5版本: 如果普通标签上存在slot属性，但不存在slotScope属性，不会进入该条件
          // 2.6版本: 如果template或组件标签上使用了v-slot,一定会存在el.slotScope的值，因为emptySlotScopeToken变量保证了slotScope存在值

          // 拿到当前节点的插槽名
          const name = element.slotTarget || '"default"';
          // 将当前AST对象添加到父标签的scopedSlots属性中
          (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[
            name
          ] = element;
        }

        // 将当前节点推入到父元素的children中
        currentParent.children.push(element);
        // 当前节点的parent属性指向父元素
        element.parent = currentParent;
      }
    }

    // final children cleanup
    // filter out scoped slots
    // 过滤掉该元素children属性内所有具有插槽作用域的插槽节点，因为已经保存在了scopedSlots属性中，没有插槽作用域的插槽节点还是在children中
    element.children = element.children.filter((c) => !(c: any).slotScope);
    // 移除末尾空白
    trimEndingWhitespace(element);

 
    if (element.pre) {
      // 如果pre属性存在的话，说明遇到了v-pre指令标签的结束标签
      // inVPre置为false
      inVPre = false;
    }
    if (platformIsPreTag(element.tag)) {
      // 如果是pre标签，说明遇到了pre指令标签的结束标签
      // inPre置为false
      inPre = false;
    }
    // 后置处理，暂时没有
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options);
    }
  }

```

## 处理时调用的众多函数

### createASTElement
每次调用```options.start```会创建一个标签AST对象
```js
// 为标签创建AST对象
export function createASTElement(
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: [],
  };
}
```
### warnOnce
```js
let warned = false;
  // 警告一次
  function warnOnce(msg, range) {
    if (!warned) {
      // 将warned置为true，再触发warnOnce就不会进去if语句
      warned = true;
      warn(msg, range);
    }
  }

```
### trimEndingWhitespace
```js 
  /*
    <div>xxx文本
    </div>
    options.chars() 处理文本后变成"xxx文本 " 还是会留下一个空白符

    trimEndingWhitespace则用来删除标签内尾随的空白字符节点
  */
  function trimEndingWhitespace(el) {
    // remove trailing whitespace node
    if (!inPre) {
      // 没在pre标签内
      let lastNode;
      // 从后遍历节点的子标签，碰到空白符的文本节点才会进入while循环
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === " "
      ) {
        // 删除该空字符文本节点
        el.children.pop();
      }
    }
  }
```
### checkRootConstraints
```js
// 检查根标签是否符合条件
  function checkRootConstraints(el) {
    if (el.tag === "slot" || el.tag === "template") {
      // 检查根标签，是不是slot或者template标签，如果是，报警告
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
          "contain multiple nodes.",
        { start: el.start }
      );
    }
    // 如果根标签包含属性v-for，报错
    if (el.attrsMap.hasOwnProperty("v-for")) {
      warnOnce(
        "Cannot use v-for on stateful component root element because " +
          "it renders multiple elements.",
        el.rawAttrsMap["v-for"]
      );
    }
  }
```
### guardIESVGBug

```js
// 匹配以xmlns:NS和一个或多个数字
const ieNSBug = /^xmlns:NS\d+/;
// 匹配以NS和一个或多个数字和冒号
const ieNSPrefix = /^NS\d+:/;
/*
处理IE渲染svg的bug
<svg xmlns:feature="http://www.openplans.org/topp"></svg>
ie会渲染成
<svg xmlns:NS1="" NS1:xmlns:feature="http://www.openplans.org/topp"></svg>
guardIESVGBug会剔除xmlns:NS1=""  NS1:部分
*/
function guardIESVGBug(attrs) {
  const res = [];
  for (let i = 0; i < attrs.length; i++) {
    // 遍历attrs属性数组
    const attr = attrs[i];
    // 属性名如果没有匹配到/^xmlns:NS\d+/
    if (!ieNSBug.test(attr.name)) {
      // 则将属性中的NS1:剔除
      attr.name = attr.name.replace(ieNSPrefix, "");
      // 推到res中
      res.push(attr);
    }
    // 匹配到/^xmlns:NS\d+/的属性则不会推入到res，也就剔除了
  }
  // 返回res属性
  return res;
}
```
### makeAttrsMap
```js
/*
  将attrs数组转为对象形式
  {
    attrName:attrValue
  }
  非IE浏览器下，重复的属性会警告
*/
function makeAttrsMap(attrs: Array<Object>): Object {
  const map = {};
  // 遍历attrs
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== "production" &&
      map[attrs[i].name] &&
      !isIE &&
      !isEdge
    ) {
      // 非IE浏览器环境下
      // 该属性如果已经存在，报警告
      warn("duplicate attribute: " + attrs[i].name, attrs[i]);
    }
    // 将value添加到map对象中
    map[attrs[i].name] = attrs[i].value;
  }
  return map;
}
```
### isTextTag
```js
// for script (e.g. type="x/template") or style, do not decode content
// 是否是script或者style标签
function isTextTag(el): boolean {
  return el.tag === "script" || el.tag === "style";
}
```
### isForbiddenTag
```js
// 判断是不是在模板中禁止使用的标签
// style标签，script标签且type属性为"text/javascript"禁止使用
// <script type="text/x-template">,如果type为"text/x-template"是可以使用的
function isForbiddenTag(el): boolean {
  return (
    el.tag === "style" ||
    (el.tag === "script" &&
      (!el.attrsMap.type || el.attrsMap.type === "text/javascript"))
  );
}
```
### checkForAliasModel
```js
// 检查model属性
function checkForAliasModel(el, value) {
  let _el = el;
  while (_el) {
    // 逐级向上遍历父级标签
    if (_el.for && _el.alias === value) {

      /*
      <div v-for="item of list">
        <input v-model="item" />
      </div>
      list数组如果是[1, 2, 3]，
     当修改输入框的值时，这个变更不会体现到list数组，v-model会失效，
     这与 v-for 指令的实现有关，如上代码中的 v-model 指令所执行的修改操作等价于修改了函数的局部变量，
     这当然不会影响到真正的数据，而应该将list定义为数组对象
      [
        { item: 1 },
        { item: 2 },
        { item: 3 },
      ]
      */
      warn(
        `<${el.tag} v-model="${value}">: ` +
          `You are binding v-model directly to a v-for iteration alias. ` +
          `This will not be able to modify the v-for source array because ` +
          `writing to the alias is like modifying a function local variable. ` +
          `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap["v-model"]
      );
    }
    _el = _el.parent;
  }
}
```
### processPre-处理v-pre指令
```js
// 处理v-pre指令
function processPre(el) {
  if (getAndRemoveAttr(el, "v-pre") != null) {
    // getAndRemoveAttr有返回值，说明存在v-pre，往AST添加pre属性，为true
    el.pre = true;
  }
}
```

### processRawAttrs-处理v-pre指令内的标签属性
```js
// processRawAttrs 函数的执行说明当前解析必然处于 v-pre 环境，
// 要么是使用 v-pre 指令的标签自身，要么就是其子节点
// 将节点上的属性都设置到 el.attrs 数组对象中，作为静态属性，数据更新时不会渲染这部分内容
function processRawAttrs(el) {
  const list = el.attrsList;
  const len = list.length;
  if (len) {
    // 新建el.attrs
    const attrs: Array<ASTAttr> = (el.attrs = new Array(len));
    for (let i = 0; i < len; i++) {
      // 遍历attrsList
      // 将值拷贝到el.attrs
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value),
        // JSON.stringify保证最终生成的代码中 el.attrs[i].value 属性始终被作为普通的字符串处理
      };
      if (list[i].start != null) {
        attrs[i].start = list[i].start;
        attrs[i].end = list[i].end;
      }
    }
  } else if (!el.pre) {
    // 标签上没有绑定属性
    // 且el上不存在pre属性，则说明现在解析的标签一定是v-pre 指令的标签的子标签
    // 设置el.plain = true，说明是纯标签
    el.plain = true;
  }
}
```

### processFor-处理v-for指令
```js
// 解析v-for指令
export function processFor(el: ASTElement) {
  let exp;
  // exp为v-for="(obj,index) in list"的属性值"(obj,index) in list"
  if ((exp = getAndRemoveAttr(el, "v-for"))) {
    // 解析等于号右边的值
    const res = parseFor(exp);
    if (res) {
      // 添加res到el中
      extend(el, res);
    } else if (process.env.NODE_ENV !== "production") {
      // 解析失败，报错
      warn(`Invalid v-for expression: ${exp}`, el.rawAttrsMap["v-for"]);
    }
  }
}
```
### parseFor-处理v-for指令
```js
type ForParseResult = {
  for: string,
  alias: string,
  iterator1?: string,
  iterator2?: string,
};
/*
解析v-for指令
三种情况
1.v-for = "obj in list"
2.v-for = "(obj, index) in list"
3.v-for = "(obj, key, index) in list"

解析之后返回的res
1.{
  for: 'list',
  alias: 'obj'
}

2.{
  for: 'list',
  alias: 'obj',
  iterator1: 'index'
}

3.{
  for: 'list',
  alias: 'obj',
  iterator1: 'key',
  iterator2: 'index'
}
*/
export function parseFor(exp: string): ?ForParseResult {
  // 正则匹配"(obj , index) in list"
  // 比如["(obj,index) of list", "(obj,index)", "list", index: 0, input: "(obj,index) of list", groups: undefined]
  const inMatch = exp.match(forAliasRE);
  // 没匹配到，直接返回
  if (!inMatch) return;
  const res = {};
  // 拿到循环的值的字符，添加到res.for属性上
  res.for = inMatch[2].trim();
  // 去掉左右的括号
  /*
    alias的值为
    1. 'obj'
    2. 'obj, index'
    3. 'obj, key, index'
  */
  const alias = inMatch[1].trim().replace(stripParensRE, "");
  /*
    1. 'obj'匹配返回null
    2. 'obj, index'匹配返回[', index', 'index']
    3. 'obj, key, index'匹配返回[', key, index', 'key', 'index']
  */
  const iteratorMatch = alias.match(forIteratorRE);
  if (iteratorMatch) {
    // 对应第2,3种情况
    // res.alias值为obj
    res.alias = alias.replace(forIteratorRE, "").trim();
    /*
      res.iterator1为
      2. 'index',
      3. 'key'
    */
    res.iterator1 = iteratorMatch[1].trim();
    if (iteratorMatch[2]) {
      // 如果存在，对应第三种情况
      // res.iterator2为index
      res.iterator2 = iteratorMatch[2].trim();
    }
  } else {
    // 对应第1种情况，res.alias直接为obj
    res.alias = alias;
  }
  return res;
}
```
### processIf-处理v-if，v-else，v-else-if指令
```js
// 处理v-if，v-else，v-else-if
function processIf(el) {
  // 得到v-if="xxx",等于号右边的值
  const exp = getAndRemoveAttr(el, "v-if");
  if (exp) {
    // 添加el.if，为属性值
    el.if = exp;
    // 添加到el.ifCondition
    addIfCondition(el, {
      // 属性值
      exp: exp,
      // AST对象,自己本身
      block: el,
    });
  } else {
    // v-else不需要属性值，getAndRemoveAttr返回空字符串，条件成立
    if (getAndRemoveAttr(el, "v-else") != null) {
      // 添加el.else，为true
      el.else = true;
    }
    const elseif = getAndRemoveAttr(el, "v-else-if");
    if (elseif) {
      // 添加el.elseif
      el.elseif = elseif;
    }
  }
}
```
### processIfConditions-处理v-else，v-else-if指令
在closeElement中被调用，只有```v-else-if，v-else```会调用，因为```v-if```和```v-else-if,v-else```必须是出现连续的标签上，```processIfConditions```就是用来判断是否符合该条件的
```js
/*
  以下面为例
  <div>
      <h1 v-if="show1"></h1>
      文本
      <h2 v-else-if="show2"></h2>
      <h3 v-else-if="show3"></h3>
      <h4 v-else></h4>
  </div>
  当匹配到h2的结束标签，调用processIfConditions的时候
  parent.children中还只包含上面两个节点（v-else-if和v-else指令的标签不会推入到父标签的children中）

  最终h1的AST对象中ifCondition为
  ifCondition : [
    {
      exp:"show1",
      block:h1的AST
    },
    {
      exp:"show2",
      block:h2的AST
    },
    {
      exp:"show3",
      block:h3的AST
    },
    {
      exp:undefined,
      block:h4的AST
    },
  ]
*/
function processIfConditions(el, parent) {
  // 因为v-else-if或者v-else的标签不会推入到他们父标签的children属性中
  // 当处理到h2,h3,h4时，都会找到h1标签
  const prev = findPrevElement(parent.children);
  if (prev && prev.if) {
    // 如果存在if属性，往v-if标签上添加ifCondition
    addIfCondition(prev, {
      exp: el.elseif,
      block: el,
    });
  } else if (process.env.NODE_ENV !== "production") {
    // 否则v-else-if或v-else指令的标签前面没有匹配到使用了v-if的标签，报错
    warn(
      `v-${el.elseif ? 'else-if="' + el.elseif + '"' : "else"} ` +
        `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? "v-else-if" : "v-else"]
    );
  }
}
```
### findPrevElement-处理v-else，v-else-if指令
```js
// children为v-else或v-else标签的父标签的children属性，从后往前遍历父标签的children，找到type为1的标签AST对象就结束循环
function findPrevElement(children: Array<any>): ASTElement | void {
  let i = children.length;
  // 从后往前遍历父节点的所有子节点
  while (i--) {
    if (children[i].type === 1) {
      // 返回找到的标签节点对象，停止循环
      return children[i];
    } else {
      // 如果不是标签节点则说明是文本节点
      if (process.env.NODE_ENV !== "production" && children[i].text !== " ") {
        // 在v-if和v-else-if之间的文本会被省略
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
            `will be ignored.`,
          children[i]
        );
      }
      // 剔除v-if和v-else-if之间的文本节点
      children.pop();
    }
  }
}
```
### addIfCondition-处理v-if，v-else，v-else-if指令
```js
// 添加到el.ifConditions数组中
export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    // 如果el.ifConditions还不存在，赋值为空数组
    el.ifConditions = [];
  }
  // 将condition推入到el.ifConditions
  el.ifConditions.push(condition);
}
```
### processOnce-处理v-once指令
```js
function processOnce(el) {
  // 解析v-once, 因为无需绑定属性值。getAndRemoveAttr返回空字符串，""!=null,条件成立
  const once = getAndRemoveAttr(el, "v-once");
  if (once != null) {
    // 添加el.once,为true
    el.once = true;
  }
}
```
### processElement
```processElement```函数是一系列```processXXX```函数的集合
```js
export function processElement(element: ASTElement, options: CompilerOptions) {
  // 处理标签上的key属性
  processKey(element);

  // determine whether this is a plain element after
  // removing structural attributes
  // 绝定是否是纯标签
  element.plain =
    !element.key && //key属性不存在
    !element.scopedSlots && //scopedSlots属性不存在
    !element.attrsList.length; //attrsList长度为0, 说明标签只使用了结构化指令,普通属性不会从attrsList中移除

  // 处理标签上的ref属性
  processRef(element);
  // 处理插槽内容
  processSlotContent(element);
  // 处理<slot></slot>标签
  processSlotOutlet(element);
  // 处理组件标签
  processComponent(element);

  // 中置处理，处理style和class属性
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element;
  }
  // 处理属性
  processAttrs(element);
  return element;
}
```
### processKey-处理key属性
```js
// 处理key属性
function processKey(el) {
  // 获取绑定的属性值
  const exp = getBindingAttr(el, "key");
  if (exp) {
    if (process.env.NODE_ENV !== "production") {
      if (el.tag === "template") {
        // key 属性不能被应用到 <template> 标签
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, "key")
        );
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1;
        const parent = el.parent;
        if (
          iterator &&
          iterator === exp &&
          parent &&
          parent.tag === "transition-group"
        ) {
          // 不要在 <transition-group> 的子元素上使用 v-for 的 index 作为 key，这和没用 key 没什么区别
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
              `this is the same as not using keys.`,
            getRawBindingAttr(el, "key"),
            true /* tip */
          );
        }
      }
    }
    // 添加el.key属性到AST对象
    el.key = exp;
  }
}
```
### processRef-处理ref属性
```js
// 处理ref属性
function processRef(el) {
  // 获取ref属性对应的属性值
  const ref = getBindingAttr(el, "ref");
  if (ref) {
    // 添加el.ref属性
    el.ref = ref;
    // 添加el.refInFor属性,是否在v-for循环内
    el.refInFor = checkInFor(el);
  }
}

// 检查当前标签是否处于v-for循环内
function checkInFor(el: ASTElement): boolean {
  let parent = el;
  // 从当前标签逐级向上遍历到根标签
  while (parent) {
    // 如果AST对象存在for属性
    if (parent.for !== undefined) {
      // 返回true，说明处于v-for循环内
      return true;
    }
    parent = parent.parent;
  }
  // 否则，返回false，没在v-for循环内
  return false;
}
```
### processSlotContent-处理插槽相关属性
```js
function processSlotContent(el) {
  let slotScope;
  // 1.如果标签是template
  if (el.tag === "template") {
    // 拿到scope属性的属性值
    slotScope = getAndRemoveAttr(el, "scope");
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && slotScope) {
      // 报警告，scope属性在2.5以后版本就被slot-scope替换掉了，slot-scope 既可以用在 template 标签也可以用在普通标签上
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
        el.rawAttrsMap["scope"],
        true
      );
    }
    // 添加el.slotScope属性，值为属性scope或者slot-scope的属性值
    el.slotScope = slotScope || getAndRemoveAttr(el, "slot-scope");
  } else if ((slotScope = getAndRemoveAttr(el, "slot-scope"))) {
    // 2.如果标签上具有slot-scope属性
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && el.attrsMap["v-for"]) {
      // 该标签上也有v-for指令
      // 报错，元素不能同时使用 slot-scope 和 v-for，v-for 具有更高的优先级
      // 应该用 template 标签作为容器，将 slot-scope 放到 template 标签上
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
        el.rawAttrsMap["slot-scope"],
        true
      );
    }
    // 添加el.slotScope属性
    el.slotScope = slotScope;
  }

  // slot="xxx"
  // 拿到slot属性的属性值
  const slotTarget = getBindingAttr(el, "slot");
  if (slotTarget) {
    // 比如<div slot></div>，slotTarget是空字符则转换成"default"
    // 添加el.slotTarget属性
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget;
    // 获取动态绑定的slot属性的属性值，添加到el.slotTargetDynamic
    el.slotTargetDynamic = !!(
      el.attrsMap[":slot"] || el.attrsMap["v-bind:slot"]
    );
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== "template" && !el.slotScope) {
      // 如果不是template标签，且没有slotScope属性
      // 将slot属性作为原生html的slot属性（是原生影子DOM的 slot 属性），添加到el.attrs数组中
      addAttr(el, "slot", slotTarget, getRawBindingAttr(el, "slot"));
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    // 如果是template标签
    if (el.tag === "template") {
      // v-slot on <template>
      // 从attrsList拿到v-slot绑定的属性对象（包括简写形式#），并从attrsList中移除
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {
        if (process.env.NODE_ENV !== "production") {
          if (el.slotTarget || el.slotScope) {
            // 如果slotTarget或者slotScope存在，即标签上使用了slot属性或者slot-scope属性
            // 报错，禁止混合使用不同的slot语法
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.parent && !maybeComponent(el.parent)) {
            /*
            如果标签的父标签（上一级标签）不是组件标签，报错
            比如  <comp>
                    <div>
                      <template v-slot>xxx</template>
                    </div>
                  </comp>
            只能出现在组件内的根位置
                 <comp>
                      <template v-slot>xxx</template>
                 </comp>
            */
            warn(
              `<template v-slot> can only appear at the root level inside ` +
                `the receiving component`,
              el
            );
          }
        }
        // 获取插槽名
        const { name, dynamic } = getSlotName(slotBinding);
        // 添加el.slotTarget
        el.slotTarget = name;
        // 添加el.slotTargetDynamic，判断插槽名是否是动态
        el.slotTargetDynamic = dynamic;
        // 作用域插槽的值，没有的话使用emptySlotScopeToken   `_empty_`
        el.slotScope = slotBinding.value || emptySlotScopeToken; // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot

      /*
        标签不是template，处理组件上的slot，即独占默认插槽，当v-slot写在组件标签上时，
        组件只会有一个插槽内容，即组件内的所有标签
        比如 <comp v-slot>
              <h1>i am slot</h1>
            </comp>
        不能和其他插槽混用，会导致作用域不明确
        比如<comp v-slot>
              <h1>i am slot</h1>
              <template v-slot:slotName>  //错误
                 <h2>i am slot</h2>
              </template>
            </comp>
      */
      // 从attrsList拿到v-slot绑定的属性对象（包括简写形式#），并从attrsList中移除
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {
        if (process.env.NODE_ENV !== "production") {
          if (!maybeComponent(el)) {
            // 不是组件上的v-slot，报错
            // v-slot 只能出现在组件上或 template 标签上
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            );
          }
          if (el.slotScope || el.slotTarget) {
            // 如果slotTarget或者slotScope存在，即标签上使用了slot属性或者slot-scope属性
            // 报错，禁止混合使用不同的slot语法
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.scopedSlots) {
            // 当使用独占插槽时，在组件内不能再使用其他插槽
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
                `<template> syntax when there are other named slots.`,
              slotBinding
            );
          }
        }
        // add the component's children to its default slot
        // 创建el.scopedSlots对象
        const slots = el.scopedSlots || (el.scopedSlots = {});
        // 获取插槽名
        const { name, dynamic } = getSlotName(slotBinding);
        /*
          创建一个template 标签的 AST 对象，该对象包裹所有的该组件标签的所有子标签
          添加到el.scopedSlots对象中。
          scopedSlots:{
             key为组件标签上的指定插槽名
             （slotContainer）/ slotName:{
                type:1,
                tag:"template",
                attrsList:[],
                parent: el , //父级指向当前组件标签
                slotTarget : "xxx", //插槽名
                slotTargetDynamic: true, //是否动态插槽名
                slotScope:"xxx", //具名插槽作用域，没有传为"_empty_"
                children:[],
             }
          }
        */
        const slotContainer = (slots[name] = createASTElement(
          "template",
          [],
          el
        ));
        // 插槽名
        slotContainer.slotTarget = name;
        //是否动态插槽名
        slotContainer.slotTargetDynamic = dynamic;
        // 遍历该组件标签的子标签
        slotContainer.children = el.children.filter((c: any) => {
          // 选出没有slot-scope属性的标签
          if (!c.slotScope) {
            // 子标签的父级指向slotContainer，意思就是该组件标签的子标签会添加到新创建的template标签的children中
            c.parent = slotContainer;
            return true;
          }
        });
        // 插槽绑定的作用域
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken;
        // 清空当前标签的children,因为当前标签的children已经不是它的子标签了，而是新建template的AST对象了
        el.children = [];
        // 存在slot指令，plain置为false
        el.plain = false;
      }
      /*  
             以上代码的意思，其实就是
                当使用独占插槽时
                <comp v-slot:slotName>
                  <h1>i am slot</h1>
                </comp>
                会转化成
                 <comp>
                  <template v-slot:slotName>
                      <h1>i am slot</h1>
                  </template>
                </comp>
            */
    }
  }
}

// 获取v-slot指定的插槽名，返回一个对象{name,dynamic},dynamic用来说明插槽名是动态还是静态的
function getSlotName(binding) {
  // 1.<template v-slot>
  // 2.<template v-slot:header="">
  // 3.<template #header="">
  // 4.<template #>
  // 5.<template v-slot:[header]="">
  // 如情况2，将v-slot:header字符中v-slot:字符替换成空字符，只保留header字符
  let name = binding.name.replace(slotRE, "");
  if (!name) {
    // 如果name为空，则说明是情况1，为默认的插槽
    if (binding.name[0] !== "#") {
      // name赋值为default
      name = "default";
    } else if (process.env.NODE_ENV !== "production") {
      // 情况4则会进入到该警告，报错v-slot必须指定一个插槽名
      warn(`v-slot shorthand syntax requires a slot name.`, binding);
    }
  }
  // 如果dynamicArgRE匹配成功，则说明是动态插槽名
  return dynamicArgRE.test(name)
    ? // dynamic [name]  传递方括号内的字符，以及dynamic为true，说明是动态值
      { name: name.slice(1, -1), dynamic: true }
    : // static name 匹配失败，则为今天值
      { name: `"${name}"`, dynamic: false };
}
```
### processSlotOutlet-处理slot标签
```js
function processSlotOutlet(el) {
  if (el.tag === "slot") {
    // 拿到slot标签上的name属性，添加到el.slotName
    el.slotName = getBindingAttr(el, "name");
    if (process.env.NODE_ENV !== "production" && el.key) {
      // 报警告，不要再slot标签上使用key属性
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
          `and can possibly expand into multiple elements. ` +
          `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, "key")
      );
    }
  }
}
```
### processComponent-处理组件（is属性和inline-template属性）
```js
// 处理组件标签
function processComponent(el) {
  let binding;
  // 获取标签上的is属性值
  if ((binding = getBindingAttr(el, "is"))) {
    // 如果存在，将is属性值赋值给el.component，使用is属性的标签将会被视为组件
    el.component = binding;
  }
  // 获取标签上的inline-template属性值
  if (getAndRemoveAttr(el, "inline-template") != null) {
    //内联模板，组件标签内的子标签不会作为插槽内容，而是作为组件的template渲染，只能有一个根节点
    // 存在，el.inlineTemplate赋值为true
    el.inlineTemplate = true;
  }
}
```
### processAttrs-处理剩余属性
前面已经处理掉了以下属性
- ```v-pre```
- ```v-for```
- ```v-if```、```v-else-if```、```v-else```
- ```v-once```
- ```key```
- ```ref```
- ```scope```、```slot-scope```、```slot```、```v-slot```
- ```is```、```inline-template```
    
还有一些指令和属性没有处理

- ```v-text```、```v-html```、```v-show```、```v-on```、```v-bind```、```v-model```、```v-cloak```
- 标签上的普通属性 
  
```processAttrs```就是处理这些剩余未被处理的属性

```js
// 处理剩余的属性
function processAttrs(el) {
  const list = el.attrsList;
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic;
  // 遍历el.attrsList
  for (i = 0, l = list.length; i < l; i++) {
    // 拿到属性key，以"v-on:click.stop.prevent"为例
    name = rawName = list[i].name;
    // 拿到属性值
    value = list[i].value;
    if (dirRE.test(name)) {
      // 属性名如果以v-或@或:或.或#字符开头，说明该属性是一个指令
      // 元素上存在指令，将元素标记动态元素
      el.hasBindings = true;
      //解析修饰符 "v-on:click.stop.prevent".replace(dirRE, "")  => "on:click.stop.prevent"
      // replace不会修改原值
      modifiers = parseModifiers(name.replace(dirRE, ""));
```
从该if语句中可以知道```.prop```修饰符可以简写```<div :text-content.prop="xxx"></div>```=>```<div .text-content="xxx"></div>```
```js
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        // 该if语句内处理.prop修饰符的简写形式
        // 如:text-content.prop可以直接简写成.text-content
        // 以.text-content.sync为例
        // 如果属性key以点开头，modifiers添加prop属性，为true
        (modifiers || (modifiers = {})).prop = true;
        // .text-content.sync.slice(1) => text-content.sync
        // 替换掉text-content.sync后的修饰符
        // name为.text-content
        name = `.` + name.slice(1).replace(modifierRE, "");
      } else if (modifiers) {
        // 如果修饰符存在，剔除修饰符  name变为v-on:click
        name = name.replace(modifierRE, "");
      }
```
处理```v-bind```指令，以及它的修饰符```.prop```、```.camel```、```.sync```
```js
      if (bindRE.test(name)) {
        // 处理v-bind指令，比如v-bind:[str]
        // 剔除掉v-bind指令，只剩下[str]
        name = name.replace(bindRE, "");
        // 拿到解析过的属性值
        value = parseFilters(value);
        // 检测是不是绑定动态属性名
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          // 如果是，去掉两边的括号
          name = name.slice(1, -1);
        }

        if (
          process.env.NODE_ENV !== "production" &&
          value.trim().length === 0
        ) {
          // 如果使用v-bind指令绑定的值为空，则报错
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          );
        }

        if (modifiers) {
          // 如果存在修饰符
          if (modifiers.prop && !isDynamic) {
            // 如果存在prop修饰符且没有绑定动态属性名
            // 将属性名转化为小驼峰
            name = camelize(name);
            // 如果属性名是innerHtml，转化为innerHTML，在DOM属性中innerHTML是一个特例，它的 HTML 四个字符串全部为大写
            if (name === "innerHtml") name = "innerHTML";
          }
          if (modifiers.camel && !isDynamic) {
            //如果存在camel修饰符，将属性名转化为小驼峰
            name = camelize(name);
          }
          if (modifiers.sync) {
            // 如果存在sync修饰符
            syncGen = genAssignmentCode(value, `$event`);
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              );
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                );
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              );
            }
          }
        }

        if (
          (modifiers && modifiers.prop) || //存在.prop修饰符
          // 或者没有使用is且属性必须被当做原生DOM prop处理的属性
          (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))
        ) {
          /*
             HTML属性和DOM属性的区别？
             https://stackoverflow.com/questions/6003819/what-is-the-difference-between-properties-and-attributes-in-html#answer-6004028

             HTML属性：定义在HTML标签上的属性，可以通过getAttributes获取原始的HTML属性
             DOM属性：经过浏览器解析HTML标签，生成的DOM节点对象，HTML上的属性会映射生成到DOM节点对象中
             大部分的DOM属性名与HTML属性名都是一样的
             1. 可以理解为HTML属性是对DOM属性的初始化
                <input  value="value">
                当用户在输入框中输入值时，DOM节点中的value属性值反映的当前值（即用户的输入值）。
                而想获取输入框的初始值是什么，可以通过getAttributes方法获取
             2. HTML属性映射成DOM属性并非是一对一的关系
                <div class="bar foobar">hi</div>
                HTML属性class，经过解析会在DOM节点中生成两个DOM属性 className:"bar foobar"和classList:["bar","foobar"]

            .prop的作用就是将用户在HTML中定义的属性，转化为DOM属性
          */
          // 满足上面条件的，会添加到el.props中
          addProp(el, name, value, list[i], isDynamic);
        } else {
          // 否则，调用addAttr
          addAttr(el, name, value, list[i], isDynamic);
        }
```
处理```v-on```指令
```js
      } else if (onRE.test(name)) {
        // 处理v-on指令，比如v-on:[event]

        // 剔除v-on:字符
        name = name.replace(onRE, "");
        // 是否动态属性
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          // 剔除两边方括号
          name = name.slice(1, -1);
        }
        // 往AST对象添加上事件的描述信息
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic);
```
处理v-text、v-html、v-show、v-cloak 、v-model以及用户自定义指令
```js
      } else {
        // 处理v-text、v-html、v-show、v-cloak 、v-model以及用户自定义指令
        // 以自定义指令为例，v-custom:[arg].xxx.xxx = "method"
        // normal directives
        // 修饰符在前面已经剔除了 name只剩custom:[arg]
        name = name.replace(dirRE, "");
        
        // "custom:[arg]".match(argMatch)返回
        // [":[arg]", "[arg]", index: 6, input: "custom:[arg]", groups: undefined]
        const argMatch = name.match(argRE);
        // 拿到arg
        let arg = argMatch && argMatch[1];
        isDynamic = false;
        if (arg) {
          // 截取开始索引和倒着数之间的字符，即custom
          name = name.slice(0, -(arg.length + 1));
          if (dynamicArgRE.test(arg)) {
            // 如果是动态属性绑定，去掉两边的括号
            arg = arg.slice(1, -1);
            // isDynamic置为true
            isDynamic = true;
          }
        }

        // 添加到el.directives
        addDirective(
          el, 
          name,  //custom
          rawName, //v-custom:[arg].xxx.xxx
          value, // method
          arg, //arg
          isDynamic,
          modifiers, //true
          list[i]
        );
        if (process.env.NODE_ENV !== "production" && name === "model") {
          // 如果是model指令，检查model指令
          checkForAliasModel(el, value);
        }
      }
```
剩下的就是普通属性了
```js
   } else {
      // 剩下的就是普通属性了
      // literal attribute
      if (process.env.NODE_ENV !== "production") {
        // 解析普通属性的属性值字符串
        const res = parseText(value, delimiters);
        if (res) {
          // 如果在属性中使用了插值表达式<div id="{{ isTrue ? 'a' : 'b' }}"></div>
          // 会打印警告，提示开发者使用v-bind指令替代
          // <div :id="isTrue ? 'a' : 'b'"></div>
          warn(
            `${name}="${value}": ` +
              "Interpolation inside attributes has been removed. " +
              "Use v-bind or the colon shorthand instead. For example, " +
              'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          );
        }
      }

      // 添加到el.attrs中
      addAttr(el, name, JSON.stringify(value), list[i]);
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      // 虚拟DOM创建真实DOM的过程中，使用 setAttribute 方法将属性添加到真实DOM元素上
      // 而火狐浏览器无法通过setAttribute为video标签添加muted 属性
      if (
        !el.component &&
        name === "muted" &&
        platformMustUseProp(el.tag, el.attrsMap.type, name)
      ) {
        // 将muted属性添加到el.props中，el.props中的属性会直接填加到DOM对象中
        addProp(el, name, "true", list[i]);
      }
    }
  }
}
```
### parseModifiers-解析修饰符
```js
// 解析修饰符，以"on:click.stop.prevent"为例
function parseModifiers(name: string): Object | void {
  // 匹配返回[".stop", ".prevent"]
  const match = name.match(modifierRE);
  if (match) {
    const ret = {};
    /*
      遍历match，生成一个对象
      {
        stop:true,
        prevent:true,
      }
    */ 
    match.forEach((m) => {
      // 截取点后面的字符作为key，赋值为true
      ret[m.slice(1)] = true;
    });
    // 返回该对象
    return ret;
  }
}
```

### parseFilters-解析过滤器
:::tip 文件目录
/src/compile/parser/filter-parser.js
:::
```js
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
```
### parseText-解析文本内容（插值表达式）
:::tip 文件目录
/src/compile/parser/text-parser.js
:::
```js
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
```
### parseStyleText
:::tip 文件目录
/src/platform/web/util/style.js
:::
```js
// 解析使用bind指令绑定的style属性值
export const parseStyleText = cached(function (cssText) {
  const res = {}
  // 负前瞻，查找;且后面不能是 非左圆括号和右圆括号
  // 比如color:red;background:url(www.xxx.com?a=1&amp;copy=3);
  // url中的分号不会匹配
  const listDelimiter = /;(?![^(]*\))/g
  // 匹配:和除换行符的其他字符
  const propertyDelimiter = /:(.+)/

  // <div style="color: red; background: green;"></div>为例
  // 按照;分隔成数组，['color: red','background: green']
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      // 继续按:分割 [color,red]
      const tmp = item.split(propertyDelimiter)
      /*
        长度大于1才会塞入对象
        最终生成的对象{
          color:"red",
          background:"green"
        }
      */ 
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim())
    }
  })
  // 返回该对象
  return res
})
```
## 前置，中置，后置处理
前置，中置，后置处理的函数来自下面的文件
:::tip 文件目录
/src/platforms/web/compiler/modules/index.js
:::
该文件导出了一个数组，内容分别来自于同目录下的三个文件```model.js,class.js,style.js```，分别处理了```v-model```，```class```属性和```style```属性
```js
import klass from './class'
import style from './style'
import model from './model'
/*
  [
    {
      staticKeys: ['staticClass'],
      transformNode,
      genData
    },
    {
      staticKeys: ['staticStyle'],
      transformNode,
      genData
    },
    {
      preTransformNode
    }
  ]
*/
export default [
  klass,
  style,
  model
]
```
在parse方法中，通过```pluckModuleFunction```方法从中提取出对应的方法
```js
  // 中置处理，transforms = [transformNode , transformNode] 
  transforms = pluckModuleFunction(options.modules, "transformNode");
  // 前置处理，preTransforms = [ preTransformNode ] 
  preTransforms = pluckModuleFunction(options.modules, "preTransformNode");
  // 后置处理，暂时为空数组，当有需要的时候可以使用
  postTransforms = pluckModuleFunction(options.modules, "postTransformNode");
```
### model文件
:::tip 文件目录
/src/platforms/web/compiler/modules/model.js
:::
### preTransformNode
```js
/*
  preTransformNode会将一个包含v-model指令且使用bind指令绑定type属性的input标签
  <input v-model="data[type]" :type="type">
  扩展成下面三种
  <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
  <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
  <input v-else :type="type" v-model="data[type]">

  由于使用了绑定的type属性，所以input的类型无法确定，不同类型的input表现行为不一致
  如类型为 checkbox 和 radio 的行为是不一样的
  Vue选择在编译时就将类型区分开来，到代码生成阶段，能根据三种不同情况生成三种对应的代码
*/
function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') {
    // 只有input标签会进行处理
    const map = el.attrsMap
    if (!map['v-model']) {
      // 如果不存在v-model属性，直接返回
      return
    }

    let typeBinding
    // 比如标签为 <input v-model="val" :type="inputType" />
    if (map[':type'] || map['v-bind:type']) {
      // typeBinding的值为inputType
      typeBinding = getBindingAttr(el, 'type')
    }
    
    // 比如标签为 <input v-model="val" v-bind="{ type: inputType }" />
    if (!map.type && !typeBinding && map['v-bind']) {
      // typeBinding的值为"({ type : inputType }).type"
      typeBinding = `(${map['v-bind']}).type`
    }

    // 只有是使用了 v-model 属性并且使用了绑定的 type 属性的 input 标签才会进入真正的处理
    if (typeBinding) {
      // 以<input v-model="val" :type="inputType" v-if="display" />为例、
      
      // 拿到v-if的属性值 'display'
      const ifCondition = getAndRemoveAttr(el, 'v-if', true)
      // ifCondition存在，则为"&&(display)"，否则为空字符，因为开发者也可能在标签上使用v-if指令，需要将if判断合并起来
      const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : ``
      // 是否存在v-else指令
      const hasElse = getAndRemoveAttr(el, 'v-else', true) != null
      // 拿到v-else-if的属性值
      const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true)


      // 1. checkbox  扩展类型为checkbox的input标签
      // 克隆一个AST对象用来描述type为checkbox的input标签
      const branch0 = cloneASTElement(el)
      // process for on the main node
      // 处理v-for指令
      processFor(branch0)
      // 添加到el.attrsList和el.attrsMap对象中，将克隆出来的标签视作<input type="checkbox" />
      addRawAttr(branch0, 'type', 'checkbox')
      // 调用processElement
      processElement(branch0, options)
      // el.processed置为true，说明已经被处理过
      branch0.processed = true // prevent it from double-processed
      // el.if 的值为 "inputType==='checkbox'&&display"
      branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
      // 添加到el.ifCondition中
      addIfCondition(branch0, {
        exp: branch0.if,
        block: branch0
      })


      // 2. add radio else-if condition  扩展类型为radio的input标签
      // 克隆一个AST对象用来描述type为radio的input标签
      const branch1 = cloneASTElement(el)
      // 因为前面处理过了v-for，这里就不在处理了
      getAndRemoveAttr(branch1, 'v-for', true)
      addRawAttr(branch1, 'type', 'radio')
      processElement(branch1, options)

      // 添加到branch0.ifCondition中
      addIfCondition(branch0, {
        exp: `(${typeBinding})==='radio'` + ifConditionExtra,
        block: branch1
      })

      // 3. other  扩展类型为其他的input标签
      // 克隆一个AST对象用来描述type为其他类型的input标签
      const branch2 = cloneASTElement(el)
      getAndRemoveAttr(branch2, 'v-for', true)
      addRawAttr(branch2, ':type', typeBinding)
      processElement(branch2, options)
      // 添加到branch0.ifCondition中
      addIfCondition(branch0, {
        exp: ifCondition,
        block: branch2
      })

      if (hasElse) {
        // 存在v-else指令
        branch0.else = true
      } else if (elseIfCondition) {
        // 存在v-else-if指令
        branch0.elseif = elseIfCondition
      }

      // 返回该新的处理过的AST对象
      return branch0
    }
  }
}

// 克隆AST对象
function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}
```
### class文件
:::tip 文件目录
/src/platforms/web/compiler/modules/class.js
:::
### transformNode
```js
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
```
### style文件
:::tip 文件目录
/src/platforms/web/compiler/modules/style.js
:::
### transformNode
```js
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
```

## helper.js
:::tip 文件目录
/src/compiler/helpers.js
:::
操作属性ast的众多方法
### baseWarn
```js
/* eslint-disable no-unused-vars */
export function baseWarn (msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`)
}
```

### pluckModuleFunction
```js
/*
   从options.modules中取出指定的函数
    [
      {
        staticKeys: ['staticClass'],
        transformNode,
        genData
      },
      {
        staticKeys: ['staticStyle'],
        transformNode,
        genData
      },
      {
        preTransformNode
      }
    ]
*/
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  /*
    比如传入的key是transformNode
    modules.map(m => m[transformNode]筛选出transformNode
    结果是[transformNode,transformNode,undefined]
    filter(_ => _)的作用是过滤掉undefined
  */
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}
```
### addProp
```js
// 绑定的原生DOM prop调用此方法添加到el.props数组中
export function addProp (el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  // 添加到el.props数组中
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range))
  // el.plain置为false
  el.plain = false
}
```
### addAttr
```js
// 根据第五个参数dynamic，将属性的对象描述添加到el.dynamicAttrs和el.attrs数组中
export function addAttr (el: ASTElement, name: string, value: any, range?: Range, dynamic?: boolean) {
  const attrs = dynamic 
    ? (el.dynamicAttrs || (el.dynamicAttrs = []))
    : (el.attrs || (el.attrs = []))
  // 调用rangeSetItem后，对象为{name, value, dynamic, start, end}
  attrs.push(rangeSetItem({ name, value, dynamic }, range))
  // el.plain置为false，因为调用了addAttr，肯定碰到了结构性指令
  el.plain = false
}
```
### addRawAttr
```js
// 添加到AST对象的el.attrsList和el.attrsMap中
export function addRawAttr (el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value
  el.attrsList.push(rangeSetItem({ name, value }, range))
}
```
### addDirective
```js
// 往AST对象，添加el.directives
export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  isDynamicArg: boolean,
  modifiers: ?ASTModifiers,
  range?: Range
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({
    name,
    rawName,
    value,
    arg,
    isDynamicArg,
    modifiers
  }, range))
  el.plain = false
}
```
### addHandler
```js
<div></div>
```
```js
// 根据修饰符前置处理事件名称
// 以@[event].capture和@click.capture为例  也就是说@click.capture与@!click是一样的
function prependModifierMarker (symbol: string, name: string, dynamic?: boolean): string {
  return dynamic
    ? `_p(${name},"${symbol}")` //动态绑定的事件名称  返回"_p(event,!)"
    : symbol + name //没有动态绑定  返回"!click"
}


// addHandler函数会为元素添加el.events和el.nativeEvents对象，用来描述事件的信息
export function addHandler (
  el: ASTElement,
  name: string, //事件名称
  value: string, //事件值
  modifiers: ?ASTModifiers, //修饰符描述对象
  important?: boolean,
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean
) {
  // 修饰符对象 modifiers 是否存在，不存在则为冻结的空对象
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    // 如果同时存在修饰符prevent和passive，报错
    // 比如scroll滚动事件，每次事件产生，浏览器都会去查询一下是否有preventDefault阻止该次事件的默认动作
    // passive修饰符的作用就是告诉浏览器，不用查询了，没有用preventDefault阻止默认动作
    // 而prevent修饰符的作用就是阻止浏览器的默认行为，两个修饰符的作用冲突了
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    )
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  if (modifiers.right) {
    // 如果存在.right修饰符，鼠标右键
    if (dynamic) {
      //如果是动态绑定属性
      // 如果动态绑定的是click事件，将事件名称重写为contextmenu
      name = `(${name})==='click'?'contextmenu':(${name})`
    } else if (name === 'click') {
      // 如果没有动态绑定，且事件名为click，直接赋值为contextmenu
      name = 'contextmenu'
      // 删除.right修饰符
      delete modifiers.right
    }
  } else if (modifiers.middle) {
    // 如果存在.middle修饰符，鼠标滚轮
    if (dynamic) {
      // 如果动态绑定的是click事件，将事件名称重写为mouseup
      name = `(${name})==='click'?'mouseup':(${name})`
    } else if (name === 'click') {
      // 如果没有动态绑定，且事件名为click，直接赋值为mouseup
      name = 'mouseup'
    }
  }

  // check capture modifier
  if (modifiers.capture) {
    // 删除.capture修饰符
    delete modifiers.capture
    // 返回"_p(event,!)"或"!click"
    name = prependModifierMarker('!', name, dynamic)
  }
  if (modifiers.once) {
    // 删除.once修饰符
    delete modifiers.once
    // 返回"_p(event,~)"或"~click"
    name = prependModifierMarker('~', name, dynamic)
  }
  /* istanbul ignore if */
  if (modifiers.passive) {
    // 删除.passive修饰符
    delete modifiers.passive
    // 返回"_p(event,&)"或"&click"
    name = prependModifierMarker('&', name, dynamic)
  }

  let events
  if (modifiers.native) {
    // 删除.native修饰符
    delete modifiers.native
    // events拿到el.nativeEvents对象的引用，没有则创建
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    // 否则events拿到el.events对象的引用，没有则创建
    events = el.events || (el.events = {})
  }

  /*
     示例
     <div @click.prevent="handleClick1" @click="handleClick2" @click.self="handleClick3"></div>
     1.解析第一个事件时@click.prevent="handleClick1" el.events.click还不存在，走最后的else条件
        newHandler:{
          value:"handleClick1",
          dynamic:false,
          modifiers: { prevent: true }
        }

        el.events:{
            click:{
              value:"handleClick1",
              dynamic:false,
              modifiers: { prevent: true }
            }
        }
     2.解析第二个事件时@click="handleClick2" ，el.events.click为对象，走中间的else if条件
        newHandler:{
          value:"handleClick2",
          dynamic:false,
          modifiers: {  }
        }
        el.events:{
            click:[
              {
                value:"handleClick1",
                dynamic:false,
                modifiers: { prevent: true }
              },
              {
                value:"handleClick2",
                dynamic:false,
                modifiers: { }
              },
            ]
        }
     3.解析第三个事件时@click.self="handleClick3"，el.events.click为数组，走第一个if条件
  */
  // 创建一个newHandler对象
  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range)
  if (modifiers !== emptyObject) {
    // 如果修饰符对象 modifiers 不等于 emptyObject 则说明事件使用了修饰符
    // 将修饰符对象赋值给newHandler.modifiers
    newHandler.modifiers = modifiers
  }

  // 拿到el.events/nativeEvents中的事件描述对象
  const handlers = events[name]
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    // 如果是数组
    // 根据第五个参数，判断添加的顺序，为true添加到数组开头，最先执行，否则添加到末尾
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    // 如果不是数组，则说明该事件此时只有一个绑定，为对象
    // 根据第五个参数，判断添加的顺序，为true，塞到数组开头，最先执行，否则塞到末尾
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    // 剩下的情况为第一次解析该事件，直接赋值
    events[name] = newHandler
  }

  // el.plain置为false
  el.plain = false
}
```

### getRawBindingAttr
```js
// 获取AST对象上rawAttrsMap对应的属性值
export function getRawBindingAttr (
  el: ASTElement,
  name: string
) {
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}
```
### getBindingAttr
```js
// 获取指定的属性值
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean //用来控制是否会获取静态的属性值
): ?string {
  // 获取动态绑定的属性值
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name)
  if (dynamicValue != null) {
    // 如果获取到了值包括空字符串（没获取到为undefined，undefined==null）
    // 解析属性值上的过滤器符号
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    // 动态的没找到，找静态绑定的属性值
    const staticValue = getAndRemoveAttr(el, name)
    if (staticValue != null) {
      // 返回找到的静态属性值
      return JSON.stringify(staticValue)
    }
  }
}
```
### getAndRemoveAttr
```js
/*
   从 el.attrsList 中删除指定的属性，并得到该属性值，没找到返回undefined
*/
export function getAndRemoveAttr (
  el: ASTElement,
  name: string, //传入的attrName
  removeFromMap?: boolean
): ?string {
  let val //val保存attrName对应的attrValue
  // 如果attrName存在于attrsMap中
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    // 遍历attrsList
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        // 将该属性从attrList中删除
        list.splice(i, 1)
        break
      }
    }
  }
  // 如果传入了removeFromMap为true，也从attrsMap中删除
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  return val
}
```
### getAndRemoveAttrByRegex
```js
// 根据传入的正则匹配，从attrsList删除对应的AST
export function getAndRemoveAttrByRegex (
  el: ASTElement,
  name: RegExp
) {
  const list = el.attrsList
  // 遍历attrsList
  for (let i = 0, l = list.length; i < l; i++) {
    const attr = list[i]
    // 如果attr匹配到了传入的正则，将该属性剔除
    if (name.test(attr.name)) {
      list.splice(i, 1)
      // 返回该attr
      return attr
    }
  }
}
```
### rangeSetItem
```js
// 往指定对象上添加start和end属性
function rangeSetItem (
  item: any,
  range?: { start?: number, end?: number }
) {
  if (range) {
    if (range.start != null) {
      item.start = range.start
    }
    if (range.end != null) {
      item.end = range.end
    }
  }
  return item
}

```