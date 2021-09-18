/* @flow */

import config from 'core/config'
import { addHandler, addProp, getBindingAttr } from 'compiler/helpers'
import { genComponentModel, genAssignmentCode } from 'compiler/directives/model'

let warn

// in some cases, the event used has to be determined at runtime
// so we used some reserved tokens during compile.
// 在某些情况下，使用的事件必须在运行时确定，因此我们在编译期间使用了一些保留的标记
export const RANGE_TOKEN = '__r'
export const CHECKBOX_RADIO_TOKEN = '__c'  //这个没用到

export default function model (
  el: ASTElement,
  dir: ASTDirective,
  _warn: Function
): ?boolean {
  warn = _warn
  // v-model绑定的值
  const value = dir.value
  // v-model的修饰符
  const modifiers = dir.modifiers
  // 标签名
  const tag = el.tag
  // 标签的type属性值
  const type = el.attrsMap.type

  if (process.env.NODE_ENV !== 'production') {
    // inputs with type="file" are read only and setting the input's
    // value will throw an error.
    if (tag === 'input' && type === 'file') {
      // 如果是file类型的input标签，报错
      // 因为文件上传是只读的，不能通过v-model进行双向绑定，可以通过change事件来获取文件上传的值
      warn(
        `<${el.tag} v-model="${value}" type="file">:\n` +
        `File inputs are read only. Use a v-on:change listener instead.`,
        el.rawAttrsMap['v-model']
      )
    }
  }

  if (el.component) {
    // 如果是组件
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    // 组件标签不需要额外的运行时处理，返回false
    return false
  } else if (tag === 'select') {
    // 如果是select标签
    genSelect(el, value, modifiers)
  } else if (tag === 'input' && type === 'checkbox') {
    // 如果是复选框checkbox
    genCheckboxModel(el, value, modifiers)
  } else if (tag === 'input' && type === 'radio') {
    // 如果是单选框radio
    genRadioModel(el, value, modifiers)
  } else if (tag === 'input' || tag === 'textarea') {
    // 如果是其他类型的input标签，或者是textarea标签
    genDefaultModel(el, value, modifiers)
  } else if (!config.isReservedTag(tag)) {
    // 如果不是平台保留标签，即组件
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    return false
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `<${el.tag} v-model="${value}">: ` +
      `v-model is not supported on this element type. ` +
      'If you are working with contenteditable, it\'s recommended to ' +
      'wrap a library dedicated for that purpose inside a custom component.',
      el.rawAttrsMap['v-model']
    )
  }

  // ensure runtime directive metadata
  // 需要运行时处理，返回true
  return true
}

// 处理复选框checkbox上的v-model
function genCheckboxModel (
  el: ASTElement,
  value: string, //v-model绑定的值
  modifiers: ?ASTModifiers
) {
  // 获取.number修饰符
  const number = modifiers && modifiers.number
  // 获取value属性值，没有为null
  const valueBinding = getBindingAttr(el, 'value') || 'null'
  // 获取true-value值， 默认为true
  const trueValueBinding = getBindingAttr(el, 'true-value') || 'true'
  // 获取false-value值，默认为false
  const falseValueBinding = getBindingAttr(el, 'false-value') || 'false'
  /*
    <input value="name" true-value="yes" false-value="no" type="checkbox" v-model.number="test['test1'][test2]">
    以该标签为例
    生成一个三目表达式，作用是复选框标签初始化时，复选框是否勾选需要根据v-model绑定的变量进行判断
    `Array.isArray(test['test1'][test2])?
     _i(test['test1'][test2],name)>-1 : _q(test['test1'][test2],yes)
    `
    可以猜出：_i()和_q()的作用
    _i()：如果绑定的变量是数组，该变量内是否包含value属性值，如果是则勾选上
    _q()：如果绑定的变量不是数组，该变量的值是否等于true-value的值，如果是则勾选上
    _i()和_q()的具体代码后面再说
  */
  //  添加checked属性到el.props中，值为上面生成的表达式，初始化时用来对checked属性进行赋值
  addProp(el, 'checked',
    `Array.isArray(${value})` +  //是否为数组
    `?_i(${value},${valueBinding})>-1` + (
      trueValueBinding === 'true' //true-value的值是否为true
        ? `:(${value})` //为true，说明没有提供true-value属性
        : `:_q(${value},${trueValueBinding})` //不为true，说明提供了true-value属性，使用_q()进行包裹
    )
  )

  /*
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
  // 添加change事件到el.events中，值为上面的字符代码
  addHandler(el, 'change',
    `var $$a=${value},` +
        '$$el=$event.target,' +
        `$$c=$$el.checked?(${trueValueBinding}):(${falseValueBinding});` +
    'if(Array.isArray($$a)){' +
      `var $$v=${number ? '_n(' + valueBinding + ')' : valueBinding},` +
          '$$i=_i($$a,$$v);' +
      `if($$el.checked){$$i<0&&(${genAssignmentCode(value, '$$a.concat([$$v])')})}` +
      `else{$$i>-1&&(${genAssignmentCode(value, '$$a.slice(0,$$i).concat($$a.slice($$i+1))')})}` +
    `}else{${genAssignmentCode(value, '$$c')}}`,
    null, true
  )
}


// 处理单选框radio上的v-model
function genRadioModel (
  el: ASTElement,
  value: string, //v-model绑定的值
  modifiers: ?ASTModifiers
) {
  // 获取.number修饰符
  const number = modifiers && modifiers.number
  // 获取value属性值，没有为null
  let valueBinding = getBindingAttr(el, 'value') || 'null'
  // 如果存在number修饰符，通过_n()包裹属性值
  valueBinding = number ? `_n(${valueBinding})` : valueBinding
  /*
      单选框的比较简单，只需要判断绑定的变量值与哪个标签的value值相等就行了
      <input name="name" value="name1" id="radio"  type="radio" v-model="test['test1'][test2]">
      <input name="name" value="name2" id="radio"  type="radio" v-model="test['test1'][test2]">
      <input name="name" value="name3" id="radio"  type="radio" v-model="test['test1'][test2]">
      以上面第一个标签为例
  */
  // 添加checked属性到el.props  值为"_q(test['test1'][test2], name1)"，用来判断绑定的变量值与哪个标签value属性相等
  addProp(el, 'checked', `_q(${value},${valueBinding})`)
  // 添加change事件到el.events中，值为"$set(test['test1'] ,[test2], name1)"
  addHandler(el, 'change', genAssignmentCode(value, valueBinding), null, true)
}


// 处理select标签上的v-model
function genSelect (
  el: ASTElement,
  value: string, //v-model绑定的值
  modifiers: ?ASTModifiers
) {
  // 获取.number修饰符
  const number = modifiers && modifiers.number

  /*
      Array.prototype.filter
      .call($event.target.options,function(o){return o.selected}) // 筛选出选中的option标签
      .map(function(o){
        var val = "_value" in o ? o._value : o.value;  // 获取option标签的value属性，三目运算是为了兼容不同平台
        return ${number ? '_n(val)' : 'val'} // 如果存在number修饰符，通过_n()包裹属性值
      })
      这串字符代码的意思就是，获取选择器选中的值，保存在数组中
  */
  const selectedVal = `Array.prototype.filter` +
    `.call($event.target.options,function(o){return o.selected})` +
    `.map(function(o){var val = "_value" in o ? o._value : o.value;` +
    `return ${number ? '_n(val)' : 'val'}})`
  
  // 如果是多选就取整个数组的值，单选就取数组内第一个元素
  const assignment = '$event.target.multiple ? $$selectedVal : $$selectedVal[0]'
  let code = `var $$selectedVal = ${selectedVal};`
  /*
   <select name="select" v-model="test['test1'][test2]" >
     <option value="value1"></option>
     ...
   </select>
   以该select标签为例
    code经过处理会生成如下可执行的字符串，代码的意思就是为v-model绑定的变量进行赋值
    `var $$selectedVal = Array.prototype.filter
                        .call($event.target.options,function(o){return o.selected})
                        .map(function(o){
                           var val = "_value" in o ? o._value : o.value;
                           return 'val'
                         };
     $set(test['test1'] ,[test2], '$event.target.multiple ? $$selectedVal : $$selectedVal[0]')`
  */
  code = `${code} ${genAssignmentCode(value, assignment)}`
  // 添加到el.events中，为change事件，值为上面的字符代码
  addHandler(el, 'change', code, null, true)
}

// 处理其他类型的input标签，或者是textarea标签上的v-model
function genDefaultModel (
  el: ASTElement,
  value: string, //v-model绑定的值
  modifiers: ?ASTModifiers
): ?boolean {
  // 拿到input的type属性
  const type = el.attrsMap.type

  // warn if v-bind:value conflicts with v-model 使用bind绑定的value和v-model会冲突
  // except for inputs with v-bind:type 如果要同时使用，type属性也需要使用bind绑定
  if (process.env.NODE_ENV !== 'production') {
    // 获取标签bind指令绑定的value属性值
    const value = el.attrsMap['v-bind:value'] || el.attrsMap[':value']
    // 获取标签bind指令绑定的type属性值
    const typeBinding = el.attrsMap['v-bind:type'] || el.attrsMap[':type']
    if (value && !typeBinding) {
      // <input type="text" :value="msg" v-model="msg">
      // 如果bind指令绑定了value属性且没有使用bind指令绑定type属性，则会警告
      const binding = el.attrsMap['v-bind:value'] ? 'v-bind:value' : ':value'
      warn(
        `${binding}="${value}" conflicts with v-model on the same element ` +
        'because the latter already expands to a value binding internally',
        el.rawAttrsMap[binding]
      )
    }
  }

  // 获取v-model的修饰符
  const { lazy, number, trim } = modifiers || {}
  // 没有lazy修饰符且类型不是range，为true
  const needCompositionGuard = !lazy && type !== 'range'
  // event为事件名称，
  // 如果lazy修饰符存在，event为"change"
  // lazy不存在的话，如果是标签类型是range，event为"__r"
  // 其余情况，event为"input"
  const event = lazy
    ? 'change'
    : type === 'range'
      ? RANGE_TOKEN
      : 'input'

  let valueExpression = '$event.target.value'
  if (trim) {
    // 如果存在.trim修饰符，加一个trim()方法
    valueExpression = `$event.target.value.trim()`
  }
  if (number) {
    // 如果存在.number修饰符，加一个_n()进行包裹
    valueExpression = `_n(${valueExpression})`
  }

  /*
  以下面的输入框为例
  <input type="text" v-model="test['test1'][test2]">
  生成的code为"$set(test['test1'] ,[test2], $event.target.value)"
  */
  let code = genAssignmentCode(value, valueExpression)

  if (needCompositionGuard) {
    // 作用：当在文本框使用输入法时，表单内并没有输入任何内容，但是也触发了input事件
    // 使用输入法时会触发compositionstart事件，vue在该事件触发时，为target添加了一个标志composing
    // 所以当为true时，就不往下执行了
    code = `if($event.target.composing)return;${code}`
  }

  // 添加标签的value属性到el.props，为v-model绑定的变量
  addProp(el, 'value', `(${value})`)
  // 添加input事件到el.events中，第五个参数表示优先级最高
  addHandler(el, event, code, null, true)

  if (trim || number) {
    // 如果存在trim或者number修饰符，添加blur事件，调用的方法为$forceUpdate()，暂时还不知道作用
    addHandler(el, 'blur', '$forceUpdate()')
  }
}


/*
  _i(),_q(),_n()
*/