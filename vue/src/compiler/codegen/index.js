/* @flow */

import { genHandlers } from './events'
import baseDirectives from '../directives/index'
import { camelize, no, extend } from 'shared/util'
import { baseWarn, pluckModuleFunction } from '../helpers'
import { emptySlotScopeToken } from '../parser/index'

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (el: ASTElement, dir: ASTDirective, warn: Function) => boolean;


// 构建一个对象，添加一些生成代码时用到的处理函数
export class CodegenState {
  options: CompilerOptions;
  warn: Function;
  transforms: Array<TransformFunction>;
  dataGenFns: Array<DataGenFunction>;
  directives: { [key: string]: DirectiveFunction };
  maybeComponent: (el: ASTElement) => boolean;
  onceId: number; 
  staticRenderFns: Array<string>;
  pre: boolean;

  constructor (options: CompilerOptions) {
    // 编译选项
    this.options = options
    // 警告方法
    this.warn = options.warn || baseWarn
    // /src/platforms/web/compiler/modules/ 三个文件下的transformCode方法，暂时没有
    this.transforms = pluckModuleFunction(options.modules, 'transformCode')
    // /src/platforms/web/compiler/modules/ 三个文件下的genData方法
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData')
    // 合并处理指令的一些方法，来自于/src/compiler/directives/下的文件中和/src/platforms/web/compiler/directives/下的文件中
    this.directives = extend(extend({}, baseDirectives), options.directives)
    // 判断是否是保留标签
    const isReservedTag = options.isReservedTag || no
    // 判断是否是组件，AST上存在component属性或者不是平台保留标签则为组件
    this.maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)
    // 每处理一个v-once指令，加一
    this.onceId = 0
    // 保存静态节点的渲染函数
    this.staticRenderFns = []
    // 表示正在处理v-pre指令标签内的节点
    this.pre = false
  }
}

export type CodegenResult = {
  render: string,
  staticRenderFns: Array<string>
};

export function generate (
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  // 生成一个对象，生成代码字符时用到的一些属性和方法
  const state = new CodegenState(options)
  // fix #11483, Root level <script> tags should not be rendered.
  // 调用genElement生成字符串代码
  const code = ast ? (ast.tag === 'script' ? 'null' : genElement(ast, state)) : '_c("div")'

  /*
    返回一个对象
    {
      render:"with(this){return _c(...)}",  
      staticRenderFns:[_c(...),...]  //所有静态根节点的渲染函数
    }
  */
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}

export function genElement (el: ASTElement, state: CodegenState): string {

  // 因为会递归调用genElement，所以会为v-pre节点内的所有子节点都添加pre属性
  if (el.parent) {
    // 如果存在父节点，添加el.pre属性
    el.pre = el.pre || el.parent.pre
  }

  if (el.staticRoot && !el.staticProcessed) {
    // 处理静态根节点
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    // 处理v-once
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    // 处理v-for
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    // 处理v-if
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    // 为template标签且没有slotTarget且不在v-pre指令内，说明就是一个普通的template标签
    // 生成template标签内所有节点的渲染函数
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    // 处理slot标签
    return genSlot(el, state)
  } else {
    // component or element
    let code
    if (el.component) {
      // 如果是动态组件，调用genComponent
      code = genComponent(el.component, el, state)
    } else {
      let data
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        // 非普通元素或者带有 v-pre 指令的组件，调用genData处理节点的所有属性
        data = genData(el, state)
      }

      // 是否是内联模板，是则返回null，否则调用genChildren，里面调用了genElement递归生成子节点的渲染函数字符串
      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      // 最终生成的字符串为"_c(tag,data,children,normalizationType)"
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms
    // 如果提供了transformCode方法
    // 会经过modules各个模块的处理，暂时没有
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code
  }
}

// hoist static sub-trees out
// 处理静态根节点
function genStatic (el: ASTElement, state: CodegenState): string {
  // 添加staticProcessed，表示被genStatic处理过
  el.staticProcessed = true
  // Some elements (templates) need to behave differently inside of a v-pre
  // node.  All pre nodes are static roots, so we can use this as a location to
  // wrap a state change and reset it upon exiting the pre node.
  
  // 初始为false
  const originalPreState = state.pre
  if (el.pre) {
    // 如果存在v-pre指令，赋值为true
    state.pre = el.pre 
  }
  // 静态根节点的渲染函数 "with(this){return _c(....)"
  // 推入到staticRenderFns数组中
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)
  // 重新赋值为false，表示v-pre指令的节点处理完了
  state.pre = originalPreState
  //  返回 "_m(index, true)"
  // 第一个参数表示静态根节点渲染函数字符在staticRenderFns数组的索引
  // 第二个参数表示是否在for循环内，没有则不在for循环内
  return `_m(${
    state.staticRenderFns.length - 1
  }${
    el.staticInFor ? ',true' : ''
  })`
}

// v-once
// 处理v-once
function genOnce (el: ASTElement, state: CodegenState): string {
  // 添加onceProcessed，表示被genOnce处理过
  el.onceProcessed = true
  if (el.if && !el.ifProcessed) {
    // 如果存在v-if指令，先调用genIf，里面会再调用genOnce
    return genIf(el, state)
  } else if (el.staticInFor) {
    // 如果标签在v-for循环内
    let key = ''
    let parent = el.parent
    // 向上找到使用了v-for指令的父节点
    while (parent) {
      if (parent.for) {
        // 获取key属性
        key = parent.key
        break
      }
      parent = parent.parent
    }
    if (!key) {
      // 如果不存在key属性，警告v-once如果在v-for指令内，那么必须绑定key属性
      process.env.NODE_ENV !== 'production' && state.warn(
        `v-once can only be used inside v-for that is keyed. `,
        el.rawAttrsMap['v-once']
      )
      // 直接返回该节点渲染函数字符
      return genElement(el, state)
    }
    // 生成字符为_o(_c(...),0,key)
    return `_o(${genElement(el, state)},${state.onceId++},${key})`
  } else {
    // 不在v-for内，也没有v-if指令，调用genStatic
    return genStatic(el, state)
  }
}

// 处理v-if
export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  // 添加ifProcessed，表示被genIf处理过
  el.ifProcessed = true // avoid recursion
  // 调用genIfConditions处理ifConditions属性
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}

// 处理el.ifConditions属性
function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) {
    // 数组长度为0，直接返回
    return altEmpty || '_e()'
  }

  // 取出并删除第一个元素，因为下面会递归调用genIfConditions()
  const condition = conditions.shift()
  if (condition.exp) {
    // 如果存在表达式

    /*
      <h1 v-if="show1">h1</h1>
      <h2 v-else-if="show2">h2</h2>
      <h3 v-else>h3</h3>
      以上面为例，生成的字符为
      "(show1)" ? _c("h1",_v("h1")) : "(show2)" ? _c("h2",_v("h2")) : _c("h3",_v("h3"))
      其实v-if的原理就是，三目运算符，根据条件判断调用对应渲染函数
    */ 
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty)
    }`
  } else {
    // 生成v-else的代码字符
    return `${genTernaryExp(condition.block)}`
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  function genTernaryExp (el) {
    return altGen//如果传入了第三个参数，优先调用该参数
      ? altGen(el, state) 
      : el.once //如果存在v-once，调用genOnce
        ? genOnce(el, state)
        : genElement(el, state) //否则调用genElement生成渲染函数字符
  }
}

// 处理v-for
export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  // v-for = "(obj, key, index) in list"
  // exp: 'list',
  // alias: 'obj',
  // iterator1: ',key',
  // iterator2: ',index'
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&  //必须是组件
    el.tag !== 'slot' &&  //不是slot标签
    el.tag !== 'template' && //不是template标签
    !el.key //没有key属性
  ) {
    // 如果是组件，使用了v-for但没有key值，警告
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  // 添加forProcessed，表示被genFor处理过
  el.forProcessed = true // avoid recursion
  
  /*
    使用_l()包裹一层
    返回的字符为
    _l((list), function(obj, key, index){ return _c(...) })
  */
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` + //因为已经genFor过了，再次调用genElement处理该节点是返回的是_c(...3)
    '})'
}

// 处理AST对象中的众多属性，最终拼接成字符串形式"{ key:xxx,... }"
export function genData (el: ASTElement, state: CodegenState): string {
  let data = '{'

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  // 先处理AST的directives属性，因为指令可能会在生成之前改变 el 的其他属性
  const dirs = genDirectives(el, state)
  if (dirs) data += dirs + ','

  // key 存在key属性 data = { key: xx }
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref 存在ref属性 data = { ref: xx }
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  //具有ref属性的标签是否在v-for循环内 data = { refInFor: true }
  if (el.refInFor) { 
    data += `refInFor:true,`
  }
  // pre v-pre指令 data = { pre: true }
  if (el.pre) {
    data += `pre:true,`
  }
  // record original tag name for components using "is" attribute
  // 动态组件<component />，记录原始的名称 data = { tag: component }
  if (el.component) {
    data += `tag:"${el.tag}",`
  }

  // 执行模块(class、style)的 genData 方法
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }
  // attributes  处理attrs属性  data = { attrs: 静态属性字符串 } 或者  data = { attrs: '_d(静态属性字符串, 动态属性字符串)' }
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }
  // DOM props 处理props属性 
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }
  // event 处理events属性 data = { on: _d({'click':function($event){...},...},[eventName1, function($event){...},...]) }
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }
  // 处理nativeEvents属性, .native修饰符的事件  data = { nativeOn: _d({'click':function($event){...},...},[eventName1, function($event){...},...]) }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }
  // slot target
  // only for non-scoped slots
  // 处理非作用域插槽 data = { slot: slotName }
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }
  // scoped slots 
  // 处理作用域插槽 data = { scopedSlots:"_u([...],..)" }
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }
  // component v-model
  // 组件上的v-model    data = { model:{ value:"xxx", callback:callback,expression:"xxx" } }
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }
  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  // 去掉最后的逗号，加上闭合括号
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  // 如果存在动态属性，使用_b()包裹生成的data字符
  // _b(data, tagName, genProps生成的字符)
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // v-bind data wrap
  if (el.wrapData) {
    // 如果存在wrapData，继续进行包裹
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    // 如果存在wrapListeners，继续进行包裹
    data = el.wrapListeners(data)
  }
  return data
}

// 处理AST的directives
function genDirectives (el: ASTElement, state: CodegenState): string | void {
  const dirs = el.directives
  // 如果不存在directives属性，直接返回
  if (!dirs) return
  let res = 'directives:['
  let hasRuntime = false
  let i, l, dir, needRuntime
  for (i = 0, l = dirs.length; i < l; i++) {
    // 遍历directives属性
    dir = dirs[i]
    // 是否需要运行时处理，默认为true
    needRuntime = true

    const gen: DirectiveFunction = state.directives[dir.name]
    if (gen) {
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      // 指令还需要运行时处理，返回true，只有处理v-model的方法返回了true
      needRuntime = !!gen(el, dir, state.warn)
    }
    if (needRuntime) {
      // 如果需要运行时处理
      // res拼接一段字符串
      // 'directives:[{name:"name" ,rawName:"rawName", value:(value) ,expression:JSON.stringify(value) ,arg:"arg" ,modifiers:JSON.stringify(modifiers) },
      hasRuntime = true
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${
        dir.arg ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}` : ''
      }${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }
  if (hasRuntime) {
    // 只有指令存在运行时任务时，才会返回 res
    // 最终生成的res为 directives:['name:"name" ,rawName:"rawName", value:(value) ,expression:JSON.stringify(value) ,arg:"arg" ,modifiers:JSON.stringify(modifiers)},...]
    return res.slice(0, -1) + ']' //剔除最后的逗号，添加反方括号
  }
}

// 处理内联模板
function genInlineTemplate (el: ASTElement, state: CodegenState): ?string {
  // 拿到内联模板的节点
  const ast = el.children[0]
  if (process.env.NODE_ENV !== 'production' && (
    el.children.length !== 1 || ast.type !== 1
  )) {
    // 如果是内联模板，只能有一个子节点且该节点必须是标签节点
    state.warn(
      'Inline-template components must have exactly one child element.',
      { start: el.start }
    )
  }
  if (ast && ast.type === 1) {
     /*
      调用generate处理内联模板节点，生成的字符为
      inlineTemplate: {
      render: function () {
        with (this) {
          return _c(tag, data, children, normalizationType);
        }
      },
      staticRenderFns: [
          function () {
            with (this) {
              return _c(tag, data, children, normalizationType);
            }
          },
         ...
        ],
      }
    */
    const inlineRenderFns = generate(ast, state.options)
    return `inlineTemplate:{render:function(){${
      inlineRenderFns.render
    }},staticRenderFns:[${
      inlineRenderFns.staticRenderFns.map(code => `function(){${code}}`).join(',')
    }]}`
  }
}

// 处理作用域插槽节点  el.scopedSlots属性中
function genScopedSlots (
  el: ASTElement,
  slots: { [key: string]: ASTElement },
  state: CodegenState
): string {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  /*
     默认情况下，作用域插槽被认为是“稳定的”，这允许
     仅具有作用域插槽的子组件以跳过来自父级的强制更新。
     但在某些情况下，我们必须摆脱这种优化

     标签使用了v-for
     或者只要有一个插槽节点标签使用了
     v-slot:[slot]动态绑定 
     ||使用了v-if
     ||使用了v-for
     ||子节点中包含slot标签

     则needsForceUpdate为true，需要强制更新
  */
  let needsForceUpdate = el.for || Object.keys(slots).some(key => {
    const slot = slots[key]
    return (
      slot.slotTargetDynamic || //v-slot:[slot]动态绑定
      slot.if ||  //使用了v-if
      slot.for || //使用了v-for
      containsSlotChild(slot) //子节点中是否包含slot标签  // is passing down slot from parent which may be dynamic
    )
  })

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  /*
    如果一个使用了作用域插槽的组件，在条件分支里面，条件分支里用的是相同的组件，但是是不同的插槽内容
    生成了一个独一的key值给予所有插槽内容生成的代码，也就是下面调用的hash函数生成的
    <comp v-if="show"> 
       <template v-slot:header>
         <div>i am header1</div>
       </template>
    </comp>
    <comp v-else>
       <template v-slot:header>
         <div>i am header2</div>
       </template>
    </comp>
  */

  // 如果组件使用了作用域插槽且使用了v-if,needsKey置为true
  let needsKey = !!el.if

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    let parent = el.parent
    // 继续递归父级节点
    while (parent) {
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        // 如果父节点使用了作用域插槽，置为true
        needsForceUpdate = true
        break
      }
      if (parent.if) {
        // 如果父节点使用了if，置为true
        needsKey = true
      }
      parent = parent.parent
    }
  }

  // 遍历scopedSlots属性,拼接字符代码
  const generatedSlots = Object.keys(slots)
    .map(key => genScopedSlot(slots[key], state))
    .join(',')

  /*
    最终生成的字符
    scopedSlots:_u([
      {
        key:center,
        fn:function({msg}){
            return (showCenter)? _c("div",...) : undefined
          }
      },
      ...
    ],null,true) 或者 null,false,hash值
  */
  return `scopedSlots:_u([${generatedSlots}]${
    needsForceUpdate ? `,null,true` : ``
  }${
    !needsForceUpdate && needsKey ? `,null,false,${hash(generatedSlots)}` : ``
  })`
}

// 根据插槽内容生成一个唯一的hash值
function hash(str) {
  let hash = 5381
  let i = str.length
  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0
}

// 判断子节点中是否有slot标签
function containsSlotChild (el: ASTNode): boolean {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      // 标签为slot，返回true
      return true
    }
    // 递归调用继续判断子节点
    return el.children.some(containsSlotChild)
  }
  // 如果子节点中都没有slot标签，才会返回false
  return false
}

function genScopedSlot (
  el: ASTElement,
  state: CodegenState
): string {
  // 获取插槽节点标签上的slot-scope属性
  const isLegacySyntax = el.attrsMap['slot-scope']
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    // 如果存在v-if指令，且还没被genIf处理过，先处理v-if指令，genIf里会再调用genScopedSlot
    return genIf(el, state, genScopedSlot, `null`)
  }
  if (el.for && !el.forProcessed) {
    // 如果存在v-for指令，且还没被genFor处理过，先处理v-for指令，genFor里会再调用genScopedSlot
    return genFor(el, state, genScopedSlot)
  }

  // 如果作用域插槽的值为"_empty_"，说明v-slot没有指定作用域，赋值为空
  const slotScope = el.slotScope === emptySlotScopeToken
    ? ``
    : String(el.slotScope)
  /*
    下面的三目意思是，如果不是template标签包裹的插槽内容
    直接调用genElement生成渲染函数，
    而如果是template且存在v-if，调用genChildren生成包裹的插槽内容的渲染函数，
    并生成一个三目运算，去决定需不需要进行渲染。
    以下面为例
    <comp>
       <template v-slot:center="{msg}" v-if="showCenter">
          <div>{{msg}}</div>
       </template>
    <comp>

    fn = `function({msg}){
      return (showCenter)? _c("div",...) : undefined
    }`

    生成的字符为
    `{
      key:center,
      fn:function({msg}){
          return (showCenter)? _c("div",...) : undefined
        }
     }`

     因为标签上使用了v-if，会先调用genIf，对其进行一层包裹
     最终生成的字符为
     `
      (showCenter) ? {
      key:center,
      fn:function({msg}){
          return (showCenter)? _c("div",...) : undefined
        }
      } :
      null
     `
  */
  const fn = `function(${slotScope}){` +
    `return ${el.tag === 'template' //如果是template标签
      ? el.if && isLegacySyntax
        ? `(${el.if})?${genChildren(el, state) || 'undefined'}:undefined`
        : genChildren(el, state) || 'undefined'
      : genElement(el, state)
    }}`
  // reverse proxy v-slot without scope on this.$slots
  // 如果没有插槽作用域，添加参数,proxy:true
  const reverseProxy = slotScope ? `` : `,proxy:true`
  // 没有slotTarget，则默认为default
  return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`
}

export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean, 
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // optimize single v-for
    /*
      1.如果只有一个子节点
      2.&&该子节点有v-for指令
      3.&&不是template标签
      4.&&不是slot标签
      进行优化，直接调用genElement生成该节点的渲染函数
    */
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {
      // 获取归一化类型
      const normalizationType = checkSkip
        ? state.maybeComponent(el) ? `,1` : `,0`
        : ``
        // 因为只有一个子节点
        // 所以返回的字符为"_c(tag,data,children,normalizationType),1"
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }

    // 获取该节点归一化类型
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    // 根据节点类型调用不同的gen方法
    const gen = altGenNode || genNode
    // 返回一个数组字符拼接最后该节点的归一化类型，数组内为所有子节点的渲染函数
    // "[_c(tag,data,children,normalizationType),...,...],1"
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}

// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
/*
确定子数组所需的归一化
0：不需要归一化
1：需要简单的归一化（ 1 级深度嵌套数组）
2：需要完全归一化
*/

/*
  1.子节点中只要有一个需要完全归一化的节点，则返回2
  2.当第一个条件不满足时，再判断子节点中是否有组件，有则返回1
  3.上面都不满足则返回0
*/
function getNormalizationType (
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0
  for (let i = 0; i < children.length; i++) {
    // 遍历子节点
    const el: ASTNode = children[i]
    if (el.type !== 1) {
      // 如果不是标签节点，跳出这一级循环
      continue
    }
    /*
      如果该节点是需要完全归一化的节点
      或者该节点的ifConditions中block指向的节点中只要有一个是需要完全归一化的节点
      则返回2，跳出循环
    */
    if (needsNormalization(el) ||
        (el.ifConditions && el.ifConditions.some(c => needsNormalization(c.block)))) {
      res = 2
      break
    }
    /*
       如果该节点是组件
       或者该节点的ifConditions中block指向的节点中只要有一个是组件
       则返回1
    */
    if (maybeComponent(el) ||
        (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))) {
      res = 1
    }
  }
  return res
}
/*
  需要完全归一化的节点下列条件
  1.存在v-for
  2.或者是template标签
  3.或者是slot标签
*/
function needsNormalization (el: ASTElement): boolean {
  // 存在v-for或者是template标签或者是slot标签
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

// 根据节点类型调用不同的gen方法
function genNode (node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    // 标签节点
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) {
    // 注释节点
    return genComment(node)
  } else {
    // 文本节点
    return genText(node)
  }
}

// 处理文本节点
export function genText (text: ASTText | ASTExpression): string {
  // 以"abc{{ name }}d"为例
  // 返回的字符为 "_v(abc + _s(name) + d)"
  return `_v(${text.type === 2 //type为2，文本包含插值表达式
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}

// 处理注释节点
export function genComment (comment: ASTText): string {
  // 返回的字符为 "_e(注释文本内容)"
  return `_e(${JSON.stringify(comment.text)})`
}

// 处理slot标签
function genSlot (el: ASTElement, state: CodegenState): string {
  // slot标签上的name属性，没有则为default
  const slotName = el.slotName || '"default"'
  // 生成子节点的渲染函数字符
  const children = genChildren(el, state)
  // 生成的字符为 res = "_t(slotName, function(){ return [_c(...),...] }"
  let res = `_t(${slotName}${children ? `,function(){return ${children}}` : ''}`
  // 调用genProps处理slot标签上的属性
  const attrs = el.attrs || el.dynamicAttrs
    ? genProps((el.attrs || []).concat(el.dynamicAttrs || []).map(attr => ({
        // slot props are camelized
        name: camelize(attr.name), //slot标签上的属性名称转为驼峰
        value: attr.value,
        dynamic: attr.dynamic
      })))
    : null

  //获取v-bind绑定的对象形式值
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) {
    // 存在属性且没有子节点
    // 生成的字符res = "_t(slotName, null"
    res += `,null`
  }
  if (attrs) {
    // 存在属性
    // 生成的字符res = "_t(slotName, function(){ return [_c(...),...] },_d(...)"
    res += `,${attrs}`
  }
  if (bind) {
    // 存在v-bind绑定的对象形式
    // 生成的字符res = "_t(slotName, function(){ return [_c(...),...] }, _d(...), {xxx:xxx,...}"
    res += `${attrs ? '' : ',null'},${bind}`
  }
  // 添加闭合括号
  // 生成的字符res = "_t(slotName, function(){ return [_c(...),...] }, _d(...), {xxx:xxx,...})"
  return res + ')'
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
// 处理动态组件
function genComponent (
  componentName: string,
  el: ASTElement,
  state: CodegenState
): string {
  // 生成子节点的渲染函数，如果是内联模板，为null
  const children = el.inlineTemplate ? null : genChildren(el, state, true)
  // componentName为is属性的值
  // 返回的字符为_c(componentName, data, children)
  return `_c(${componentName},${genData(el, state)}${
    children ? `,${children}` : ''
  })`
}

// 处理AST对象上的attrs,props,dynamicAttrs属性
function genProps (props: Array<ASTAttr>): string {
  let staticProps = ``
  let dynamicProps = ``
  // 变量属性数组
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    // 根据平台处理value属性值
    const value = __WEEX__
      ? generateValue(prop.value)
      : transformSpecialNewlines(prop.value)

      if (prop.dynamic) {
        // 如果是动态属性
        // 拼接成"attrName1,attrValue1,attrName2,attrValue2,...,"
      dynamicProps += `${prop.name},${value},`
    } else {
      // 如果是普通属性
      // 拼接成'"attrName1":attrValue1,"attrName2":attrValue2,...,'
      staticProps += `"${prop.name}":${value},`
    }
  }
  // "{attrName1,attrValue1,attrName2,attrValue2,...}"
  staticProps = `{${staticProps.slice(0, -1)}}`
  if (dynamicProps) {
    // 如果存在动态属性，则返回：_d(静态属性字符串，动态属性字符串)
    // '_d({"attrName1":attrValue1,"attrName2":attrValue2,...},[attrName1,attrValue1,attrName2,attrValue2,...])'
    return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`
  } else {
    // 不存在动态属性，只返回静态属性
    return staticProps
  }
}

/* istanbul ignore next */
function generateValue (value) {
  if (typeof value === 'string') {
    return transformSpecialNewlines(value)
  }
  return JSON.stringify(value)
}

// #3895, #4268 bug 处理特殊的换行符（unicode形式的），进行修正
function transformSpecialNewlines (text: string): string {
  return text
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
