# 生成渲染函数字符代码

## generate
生成渲染函数的入口
:::tip 文件目录
/src/compiler/codegen/index.js
:::
```js
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
```
## CodegenState
生成代码字符时用到的一些属性和方法
```js
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
```
## genElement
genElement方法处理AST对象中的众多属性，先看最后一个else条件分支。会生成一串字符```"_c(tag, data, children)"```，data由```genData```函数生成，children由```genChildren```函数生成
```js
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
```
## genChildren
genChildren处理子节点元素，形成一个树形结构的渲染函数```"_c(tag, data, [_c(),_c(),...], normalizationType)"```
```js
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
      // 获取规范化类型
      const normalizationType = checkSkip
        ? state.maybeComponent(el) ? `,1` : `,0`
        : ``
        // 因为只有一个子节点
        // 所以返回的字符为"_c(tag,data,children,normalizationType),1"
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }

    // 获取该节点规范化类型
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    // 根据节点类型调用不同的gen方法
    const gen = altGenNode || genNode
    // 返回一个数组字符拼接最后该节点的规范化类型，数组内为所有子节点的渲染函数
    // "[_c(tag,data,children,normalizationType),...,...],1"
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}
```
### getNormalizationType
```js
/*
确定子数组所需的规范化
0：不需要标准化
1：需要简单的归一化（可能是 1 级深度嵌套数组）
2：需要完全标准化
*/

/*
  1.子节点中只要有一个需要完全标准化的节点，则返回2
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
      如果该节点是需要完全标准化的节点
      或者该节点的ifConditions中block指向的节点中只要有一个是需要完全标准化的节点
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
```
### needsNormalization
```js
/*
  需要完全标准化的节点下列条件
  1.存在v-for
  2.或者是template标签
  3.或者是slot标签
*/
function needsNormalization (el: ASTElement): boolean {
  // 存在v-for或者是template标签或者是slot标签
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}
```
### genNode
```js
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
```
### genText-处理文本节点
```js
// 处理文本节点
export function genText (text: ASTText | ASTExpression): string {
  // 以"abc{{ name }}d"为例
  // 返回的字符为 "_v(abc + _s(name) + d)"
  return `_v(${text.type === 2 //type为2，文本包含插值表达式
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}
```
### genComment-处理注释节点
```js
// 处理注释节点
export function genComment (comment: ASTText): string {
  // 返回的字符为 "_e(注释文本内容)"
  return `_e(${JSON.stringify(comment.text)})`
}
```

## genData
genData负责处理AST对象上的众多属性
```js
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
```
## genDirectives-处理指令
genDirectives处理AST上的directives属性，directives属性中包含了```v-text、v-html、v-show、v-cloak 、v-model```以及用户自定义指令，通过```state.directives[dir.name]```获取来自于不同的文件下的处理方法
```js
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
```
### html-处理v-html
:::tip 文件目录
/src/platforms/web/compiler/directives/html.js
:::
```js
export default function html (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    // 如果v-html绑定了值
    // 添加到AST的props属性中
    addProp(el, 'innerHTML', `_s(${dir.value})`, dir)
  }
}
```
### text-处理v-text
:::tip 文件目录
/src/platforms/web/compiler/directives/text.js
:::
```js
export default function text (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    // 如果v-text绑定了值
    // 添加到AST的props属性中
    addProp(el, 'textContent', `_s(${dir.value})`, dir)
  }
}
```
### on-处理v-on的对象形式
:::tip 文件目录
/src/compiler/directives/on.js
:::
```js
/*
当使用 v-on="{ click:handleClick }"对象形式时，会调用此方法
往AST添加wrapListeners属性，为一个方法
在genData的时候调用wrapListeners方法，使用_g()进行包裹
*/
export default function on (el: ASTElement, dir: ASTDirective) {
  if (process.env.NODE_ENV !== 'production' && dir.modifiers) {
    // 不带参数的 v-on 不支持修饰符
    warn(`v-on without argument does not support modifiers.`)
  }
  // 往AST添加wrapListeners属性
  el.wrapListeners = (code: string) => `_g(${code},${dir.value})`
}
```
### bind-处理v-bind的对象形式
:::tip 文件目录
/src/compiler/directives/bind.js
:::
```js
/*
当使用 v-bind="{ id:xxx , name:xxx }"对象形式时，会调用此方法
往AST添加wrapData属性，为一个方法
在genData的时候调用wrapListeners方法，使用_b()进行包裹
*/
export default function bind (el: ASTElement, dir: ASTDirective) {
  //往AST添加wrapListeners属性
  el.wrapData = (code: string) => {
    return `_b(${code},'${el.tag}',${dir.value},${
      dir.modifiers && dir.modifiers.prop ? 'true' : 'false'
    }${
      dir.modifiers && dir.modifiers.sync ? ',true' : ''
    })`
  }
}
```
### model-处理v-model
:::tip 文件目录
/src/platforms/web/compiler/directives/model.js
:::
v-model的核心原理也就在该文件，处理较为复杂:point_right: [v-model原理](./model.html)

### AST上新增内容
经过以上对指令的处理，AST对象上又新增一些内容，如下：
```js
let AST = {
  // 属性将作为DOM属性绑定的集合
  props: [
    {
      //v-html指令
      name: "innerHTML", //属性key
      value: "_s(xxx)", //_s()包裹属性值
      dynamic: undefined,
    },
    {
      //v-text指令
      name: "textContent", //属性key
      value: "_s(xxx)", //_s()包裹属性值
      dynamic: undefined,
    },
    /*
    <input value="name" true-value="yes" false-value="no" type="checkbox" v-model.number="test['test1'][test2]">
    处理复选框的v-model时，添加checked到props，value为
    `Array.isArray(test['test1'][test2])?
     _i(test['test1'][test2],name)>-1 : _q(test['test1'][test2],yes)
    `
    生成一个三目表达式，作用是复选框标签初始化时，复选框是否勾选需要根据v-model绑定的变量进行判断
    可以猜出：_i()和_q()的作用
    _i()：如果绑定的变量是数组，该变量内是否包含value属性值，如果是则勾选上
    _q()：如果绑定的变量不是数组，该变量的值是否等于true-value的值，如果是则勾选上
    _i()和_q()的具体代码后面再说
    */
    {
      name: "checked",
      value: `Array.isArray(test['test1'][test2])?
              _i(test['test1'][test2],name)>-1 : _q(test['test1'][test2],yes)
            `,
      dynamic: undefined,
    },
    /*
      处理单选框的v-model时，添加checked到props，value为_q(test['test1'][test2], name1)
      比较简单，只需要判断绑定的变量值与哪个标签的value值相等就行了
      <input name="name" value="name1" id="radio"  type="radio" v-model="test['test1'][test2]">
      <input name="name" value="name2" id="radio"  type="radio" v-model="test['test1'][test2]">
      <input name="name" value="name3" id="radio"  type="radio" v-model="test['test1'][test2]">
      以上面第一个标签为例
    */
    {
      name: "checked",
      value: "_q(test['test1'][test2], name1)", //用来判断绑定的变量值与哪个标签value属性相等
      dynamic: undefined,
    },
    /*
      如果是其他类型的input标签和textarea标签，处理v-model时，添加value到props
      以下面的输入框为例
      <input type="text" v-model="test['test1'][test2]">
      value为"(test['test1'][test2])"
    */

    {
      name: "value",
      value: "(test['test1'][test2])",
      dynamic: undefined,
    },
  ],
  // 没有绑定动态属性的
  attrs: [],
  // 绑定动态属性的
  dynamicAttrs: [],
  parent, //当前标签的父标签
  //该标签的子节点
  children: [],
  nativeEvents: {},
  // 绑定的事件
  events: {
    /*
        <select name="select" v-model="test['test1'][test2]" >
            <option value="value1"></option>
            ...
        </select>

        select标签上的v-model处理，添加change事件到events，value为下面的可执行字符串
        var $$selectedVal = Array.prototype.filter
                .call($event.target.options,function(o){return o.selected}) // 筛选出选中的option标签
                .map(function(o){
                   var val = "_value" in o ? o._value : o.value;  // 获取option标签的value属性，三目运算是为了兼容不同平台
                   return 'val' // 如果存在number修饰符，通过_n()包裹属性值
                 };
        //上面代码的意思是获取选择器选中的值，保存在数组中  
             
        //为绑定的变量赋值，如果是多选就取整个数组的值，单选就取数组内第一个元素
        $set(test['test1'] ,[test2], '$event.target.multiple ? $$selectedVal : $$selectedVal[0]')
    */
    change: {
      value: `
                var $$selectedVal = Array.prototype.filter
                .call($event.target.options,function(o){return o.selected})
                .map(function(o){
                   var val = "_value" in o ? o._value : o.value;
                   return 'val'
                 };
                $set(test['test1'] ,[test2], '$event.target.multiple ? $$selectedVal : $$selectedVal[0]')
            `,
      dynamic: false,
      modifiers: {},
    },
    /*
    复选框的v-model处理，添加change事件
    我们知道复选框会根据v-model绑定的变量的类型来做出不同的响应
    如果该变量是数组，那么复选框的选中与不选中是往数组添加和删除value属性值
    如果该变量是其他类型，那么复选框的选中与不选中是为该变量赋予真值和假值（真值和假值可以用户自定义，即true-value和false-value的值）
    就是通过下面的代码实现的
   `var $$a=test['test1'][test2],  //v-model绑定的变量字符
    $$el=$event.target,   //事件源
    $$c=$$el.checked?(yes):(no);   //$$c为true-value或者false-value的值
    if(Array.isArray($$a)){    //绑定的变量，如果是数组
      var $$v= _n(name),    //存在.number修饰符，用_n()包裹value属性值
      $$i=_i($$a,$$v);  //_i()的作用是判断value属性值是否存在于绑定的变量中
      if($$el.checked){  //复选框选中
        // $$i<0 已经存在的话，不会进行合并
        $$i<0 && $set(test['test1'] ,[test2], $$a.concat([$$v]) )  // 将value属性值合并到该数组
      }else{  //复选框取消选中
        // $$i>-1 已经不存在的话，不会进行剔除
        $$i>-1 && $set(test['test1'] ,[test2], $$a.slice(0,$$i).concat($$a.slice($$i+1)) )  // 将value属性值从该数组剔除
      }
    }else{ //绑定的变量，如果不是数组
      $set(test['test1'] ,[test2], $$c )  //该绑定变量赋值为true-value或者false-value的值
    }
    `
  */
    change: {
      value: `  
                var $$a=test['test1'][test2], 
                $$el=$event.target, 
                $$c=$$el.checked?(yes):(no);  
                if(Array.isArray($$a)){   
                  var $$v= _n(name),   
                  $$i=_i($$a,$$v);
                  if($$el.checked){  
                    $$i<0 && $set(test['test1'] ,[test2], $$a.concat([$$v]) ) 
                  }else{  
                    $$i>-1 && $set(test['test1'] ,[test2], $$a.slice(0,$$i).concat($$a.slice($$i+1)) ) 
                  }
                }else{ 
                  $set(test['test1'] ,[test2], $$c )  
                }
            `,
      dynamic: false,
      modifiers: {},
    },
    // 如果是单选框，添加change事件
    change: {
      value: "$set(test['test1'] ,[test2], name1)",
      dynamic: false,
      modifiers: {},
    },
    /*
        如果是其他类型的input标签和textarea标签的v-model处理
        一般是添加input事件，如果有lazy修饰符，添加的是change事件
    */
    input: {
      value: "$set(test['test1'] ,[test2], $event.target.value)",
      dynamic: false,
      modifiers: {},
    },
    // 如果输入框上存在trim或者number修饰符，添加blur事件，调用的方法为$forceUpdate()，暂时还不知道作用
    blur: {
      value: "$forceUpdate()",
      dynamic: false,
      modifiers: {},
    },
  },
  /*
    如果是组件上的v-model，添加model对象到AST中
    以<compName v-model.trim.number="test['test1'][test2]">为例
    {
      value: "(test['test1'][test2])", 
      expression: JSON.stringify(test['test1'][test2]),
      callback: callback ($$v){ 
         $set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))
      }
    }
  */
  model: {
    value: "(test['test1'][test2])",
    expression: JSON.stringify(test["test1"][test2]),
    callback: `callback ($$v){ 
                    $set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))
                }`,
  },
  // 当标签上使用 v-bind="{ id:xxx , name:xxx }"对象形式时，添加wrapData属性
  // 在genData的时候调用该方法，传入的参数code为genData生成的对象字符
  wrapData: (code: string) => {
    //  第四个参数表示是否有.prop修饰符，第五个参数为true表示有.sync修饰符，没有.sync修饰符的话，就没有第五个参数
    return `_b(${code},'tagName',{ id:xxx , name:xxx } ,true ,true)`;
  },
  // 当标签上使用 v-on="{ click:handleClick }"对象形式时，添加wrapListeners属性
  // 在genData的时候调用该方法，传入的参数code为genData生成的对象字符
  wrapListeners: (code) => `_g(${code} ,{ click:handleClick })`,
};
```
## 来自模块(class、style)的genData方法-处理class和style属性
:::tip 文件目录
/src/platforms/web/compiler/modules/class.js
:::
```js
// 生成渲染函数阶段调用，生成一段字符代码，staticClass:xxxx,class:xxx
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    // 普通属性class的值
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    // 使用bind指令绑定的class的值
    data += `class:${el.classBinding},`
  }
  return data
}
```
:::tip 文件目录
/src/platforms/web/compiler/modules/class.js
:::
```js
// 生成渲染函数阶段调用，生成一段字符代码，staticStyle:xxxx,style:xxx
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticStyle) {
    //普通属性style的值，经过了parseStyleText处理
    data += `staticStyle:${el.staticStyle},`
  }
  if (el.styleBinding) {
    //使用bind指令绑定的style的值
    data += `style:(${el.styleBinding}),`
  }
  return data
}
```
## genProps-处理HTML和DOM属性
```js
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
```
## genHandlers-处理v-on事件绑定 
事件绑定时，可以有多种写法，还有各种修饰符的应用，是怎么处理的？:point_right: [v-model原理](./events.html)
:::tip 文件目录
/src/compiler/codegen/events.js
:::

## genScopedSlots-处理插槽节点
```js
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
```
### hash
```js
// 根据插槽内容生成一个唯一的hash值
function hash(str) {
  let hash = 5381
  let i = str.length
  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0
}
```
### containsSlotChild
```js
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
```
### genScopedSlot
```js
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
```
## genInlineTemplate-处理内联模板
```js
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
```
到这里genData里面的处理就结束了

## genStatic-处理静态根节点
```js
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
```

## genOnce-处理v-once
```js
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
```
## genFor-处理v-for
```js
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
```
## genIf-处理v-if
```js
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
```
## genSlot-处理slot标签
```js
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
```
## genComponent-处理动态组件
```js
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
```
## generateValue,transformSpecialNewlines
```js
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
```
## 生成的渲染函数字符
```js
// 一个子节点时
render = _c("tagName", data, _c(tag, data, children, normalizationType), 1);
//多个子节点
render = _c(
  "tagName", 
  {
    // 还需要运行时处理的指令，只有v-model
    directives: [
      {
        name: "name",
        rawName: "rawName",
        value: "(value)",
        expression: JSON.stringify(value),
        arg: "arg", //如果是动态属性，会在包一层双引号"'arg'"
        modifiers: JSON.stringify(modifiers),
      },
    ],
    key: "xxx", //key属性值
    ref: "xxx", //ref属性值
    refInFor: true, //具有ref属性的标签是否在v-for循环内
    pre: true, //说明标签上存在v-pre指令
    tag: "component", //是动态组件的话记录原始名称
    staticClass: "xxx", //普通属性class的值
    class: "xxx", //使用bind指令绑定的class的值
    //普通属性style的值，经过了parseStyleText处理
    staticStyle: JSON.stringify({
      color: "red",
      background: "green",
    }),
    style: "xxx", //使用bind指令绑定的style的值
    // 作为标签上的属性
    // _d()第一个参数为静态属性生成的字符串，第二个参数为动态属性生成的字符串，如果没有动态属性那么attrs : "{attrName1,attrValue1,attrName2,attrValue2,...}"
    attrs:
      '_d({attrName1,attrValue1,attrName2,attrValue2,...},["attrName1":attrValue1,"attrName2":attrValue2,...,])',
    // 作为DOM属性，值同上
    domProps:
      '_d({attrName1,attrValue1,attrName2,attrValue2,...},["attrName1":attrValue1,"attrName2":attrValue2,...,])',
    // vue中事件，第一个参数为静态绑定生成的的字符串，第二个参数为动态绑定事件生成的字符串，如果没有动态绑定事件 on : "{'click':function($event){...},...}"
    on: "_d({'click':function($event){...},...},[eventName1, function($event){...},...])",
    // 使用.native修饰符绑定的事件，同上
    nativeOn:
      "_d({'click':function($event){...},...},[eventName1, function($event){...},...])",
    // 没有使用作用域插槽的标签，只使用了slot属性
    slot: "slotTarget",
    /*
        作用域插槽，以下面为例
        <comp>
        <template v-slot:center="{msg}" v-if="showCenter">
            <div>{{msg}}</div>
        </template>
        <comp>
    */
    scopedSlots: _u(
      [
        // 使用了v-if，会包一层三目运算符
        showCenter
          ? {
              key: center,
              fn: function ({ msg }) {
                return showCenter
                  ? _c("div", data, children, normalizationType)
                  : undefined;
              },
            }
          : null,
        //   没使用v-if
        {
          key: center,
          fn: function ({ msg }) {
            return showCenter
              ? _c("div", data, children, normalizationType)
              : undefined;
          },
          proxy: true, //表示只使用了v-slot但是没有绑定作用域
        },
        /*...*/
      ],
      null,
      true
    ),
    // 组件上的v-model，以<compName v-model.trim.number="test['test1'][test2]">为例
    model: {
      value: "(test['test1'][test2])",
      expression: JSON.stringify(test["test1"][test2]),
      callback: `callback ($$v){ 
                        $set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))
                    }`,
    },
    // 内联模板，会调用generate，将生成的字符包裹上一层function
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
        /*...*/
      ],
    },
  },
  // 数组中为所有子节点，如果是内联模板，该项为null
  [
    _c(tag, data, children, normalizationType),
    // 动态组件，componentName为is属性的值
    _c(componentName, data, children),
    // 静态根节点
    // 第一个参数表示，该节点渲染函数在staticRenderFns数组中的索引
    // 第二个参数表示是否在v-for指令内
    _m(index, true),
    // 只使用了v-once的标签
    _m(index),
    // 使用了v-once的标签且使用了v-if的标签，比如<div v-once v-if="show"></div>
    show ? _m(index) : _e(),
    // 使用了v-once的标签在v-for循环内
    _o(_c(tag, data, children, normalizationType), onceId, key),

    // 使用了v-for指令的标签 比如 v-for = "(obj, key, index) in list"
    _l(list, function (obj, key, index) {
      return _c(tag, data, children, normalizationType);
    }),
    /*
      <h1 v-if="show1">...</h1>
      <h2 v-else-if="show2">...</h2>
      <h3 v-else>...</h3>
      使用了v-if，v-else-if，v-else的标签
      就是根据三元运算去调用渲染函数，如果有多个v-else-if，就是多个三元进行嵌套
    */
    show1
      ? _c("h1", data, children, normalizationType)
      : show2
      ? _c("h2", data, children, normalizationType)
      : _c("h3", data, children, normalizationType),

    /*
        slot标签
        第一个参数为slot标签的name属性
        第二个参数为slot标签内的子标签，没有子标签为null
        第三个参数为slot标签上的属性（不包括name属性，因为已经从el.attrs剔除了），经过了genProp处理，没有属性则为null
        第四个参数v-bind绑定的对象形式值，没有这样绑定就没有第四个参数
    */
    _t(
      slotName,
      function () {
        return [_c(tag, data, children, normalizationType)];
      },
      _d(/*...*/),
      { key: value /*...*/ }
    ),
    // 文本节点，以"abc{{ name }}d"为例
    _v(abc + _s(name) + d),
    // 注释节点
    _e("注释文本内容"),
  ],
  1 //规范化类型
);

// 如果存在动态属性，使用_b()包裹生成的data字符
render = _c(
  "tagName",
  _b(data, tagName, "genProps生成的字符"),
  _c(tag, data, children, normalizationType),
  1
);

// 如果使用了v-bind="{ id: 'id', name: 'name' }"对象形式，使用_b()包裹生成的data字符
render = _c(
  "tagName",
  //第四个参数表示是否有.prop修饰符
  //第五个参数为true表示有.sync修饰符，没有.sync修饰符的话，就没有第五个参数
  _b(data, "tagName", { id: "id", name: "name" }, true, true),
  _c(tag, data, children, normalizationType),
  1
);

// 如果事件绑定时，使用了v-on="{ click:handleClick }"对象形式时，使用_g()包裹生成的data字符
render = _c(
  "tagName",
  _g(data, { click: handleClick }),
  _c(tag, data, children, normalizationType),
  1
);

// 根节点是静态根节点
code = {
  render: "with(this){return _m(0,true)}",
  staticRenderFns: ["with(this){return _c(...)"],
};

// 根节点使用了v-once
code = {
  render: "with(this){return _m(0,true)}",
  staticRenderFns: ["with(this){return _c(...)"],
};

// 根节点使用了v-if，v-else-if
code = {
  render: "with(this){return show ? _c(...) : _c(...) ) }",
  staticRenderFns: [
    /*...*/
  ],
};
```
这时候再回到:point_right: [compileToFunctions](./compile-entry.html#compiletofunctions)和:point_right:[$mount](./compile-entry.html#mount)方法，会使用```new Function()```将生成的渲染函数字符转换成真正的渲染函数，并添加到实例的$options选项中
```js
options.render =  function anonymous() {
                    with(this){ return _c(/*...*/) }
                  }
options.staticRenderFns = [ 
                              function anonymous() {
                                with(this){ return _c(/*...*/) }
                              },
                              function anonymous() {
                                with(this){ return _c(/*...*/) }
                              },
                          ]
```
