/* @flow */

import he from "he";
import { parseHTML } from "./html-parser";
import { parseText } from "./text-parser";
import { parseFilters } from "./filter-parser";
import { genAssignmentCode } from "../directives/model";
import { extend, cached, no, camelize, hyphenate } from "shared/util";
import { isIE, isEdge, isServerRendering } from "core/util/env";

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex,
} from "../helpers";


// 匹配@或者v-on
export const onRE = /^@|^v-on:/;


// process.env.VBIND_PROP_SHORTHAND表示当前环境是否支持.prop修饰符的简写形式，
// 如:text-content.prop="text"可简写成.text-content
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/  //匹配以v-或@或:或.或#字符开头
  : /^v-|^@|^:|^#/; //匹配以v-或@或:或#字符开头

/*
  ([\s\S]*?) [\s\S]的意思是匹配任意字符。*?意思是重复任意次，但尽可能少的重复
  (?:in|of)  分组不捕获，匹配in或者of
  ([\s\S]*)  匹配任意字符，0次或多次
  比如"(obj,index) of list".match(forAliasRE)
  返回["(obj,index) of list", "(obj,index)", "list", index: 0, input: "(obj,index) of list", groups: undefined]
*/
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
/*
  ,([^,\}\]]*) 匹配逗号和非逗号，非}，非]0次或多次
  (?:,([^,\}\]]*))?  整体出现0到1次，最外层的分组不捕获，里面的分组和上面一样
   该正则用来匹配 forAliasRE 第一个捕获组所捕获到的字符串
   比如"value, key, index".match(forIteratorRE)
   返回[", key, index", " key", " index", index: 5, input: "value, key, index", groups: undefined]
*/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
/*
匹配以字符 ( 开头，要么以字符 ) 结尾的字符串
在使用forIteratorRE之前,stripParensRE用来匹配(obj, index)中的( )进行删除
*/
const stripParensRE = /^\(|\)$/g;

//匹配方括号以及内部的除换行符号的字符，即v-bind:[xxx]=""使用了动态属性的方括号
const dynamicArgRE = /^\[.*\]$/;

// 匹配以:和0个或多个除换行符以外的字符的结尾
const argRE = /:(.*)$/;

// 匹配以:或者.或者v-bind:开头
export const bindRE = /^:|^\.|^v-bind:/;

// 匹配以点字符开头，用来匹配.prop修饰符的简写情况
const propBindRE = /^\./;

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

// 匹配以v-slot:开头或者只有v-slot字符或者以#字符开头
const slotRE = /^v-slot(:|$)|^#/;

// 匹配回车符或者换行符
const lineBreakRE = /[\r\n]/;
// 匹配空格或换页符或水平制表符（tab键）或回车符或换行符一次或多次
const whitespaceRE = /[ \f\t\r\n]+/g;

// 验证属性是否有效，匹配到空、"、'、<、>、/、=符号
const invalidAttributeRE = /[\s"'<>\/=]/;

// 引用的外部包he，解析HTML实体字符
const decodeHTMLCached = cached(he.decode);

export const emptySlotScopeToken = `_empty_`;

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

/**
 * @description: 将 HTML 字符串转换为 AST
 * @param {*} template HTML 模版
 * @return {*} options 平台特有的编译选项
 */
export function parse(
  template: string,
  options: CompilerOptions
): ASTElement | void {
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

  // 界定符
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
  function warnOnce(msg, range) {
    if (!warned) {
      // 将warned置为true，再触发warnOnce就不会进去if语句
      warned = true;
      warn(msg, range);
    }
  }

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

  // 解析html字符串
  parseHTML(template, {
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
        // 前置处理
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
  });
  return root;
}

// 处理v-pre指令
function processPre(el) {
  if (getAndRemoveAttr(el, "v-pre") != null) {
    // getAndRemoveAttr有返回值，说明存在v-pre，往AST添加pre属性，为true
    el.pre = true;
  }
}

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

// 添加到el.ifConditions数组中
export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    // 如果el.ifConditions还不存在，赋值为空数组
    el.ifConditions = [];
  }
  // 将condition推入到el.ifConditions
  el.ifConditions.push(condition);
}

function processOnce(el) {
  // 解析v-once, 因为无需绑定属性值。getAndRemoveAttr返回空字符串，""!=null,条件成立
  const once = getAndRemoveAttr(el, "v-once");
  if (once != null) {
    // 添加el.once,为true
    el.once = true;
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
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

// handle <slot/> outlets
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

// for script (e.g. type="x/template") or style, do not decode content
// 是否是script或者style标签
function isTextTag(el): boolean {
  return el.tag === "script" || el.tag === "style";
}

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
