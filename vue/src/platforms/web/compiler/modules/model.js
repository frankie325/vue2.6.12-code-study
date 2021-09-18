/* @flow */

/*
  Expand input[v-model] with dynamic type bindings into v-if-else chains
  Turn this:
    <input v-model="data[type]" :type="type">
  into this:
    <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
    <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
    <input v-else :type="type" v-model="data[type]">
  
  
  
  
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

import {
  addRawAttr,
  getBindingAttr,
  getAndRemoveAttr
} from 'compiler/helpers'

import {
  processFor,
  processElement,
  addIfCondition,
  createASTElement
} from 'compiler/parser/index'


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

export default {
  preTransformNode
}
