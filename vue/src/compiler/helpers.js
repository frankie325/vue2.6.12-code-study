/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

type Range = { start?: number, end?: number };

/* eslint-disable no-unused-vars */
export function baseWarn (msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`)
}
/* eslint-enable no-unused-vars */

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

// 绑定的原生DOM prop调用此方法添加到el.props数组中
export function addProp (el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  // 添加到el.props数组中
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range))
  // el.plain置为false
  el.plain = false
}

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

// add a raw attr (use this in preTransforms)
// 添加到AST对象的el.attrsList和el.attrsMap中
export function addRawAttr (el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value
  el.attrsList.push(rangeSetItem({ name, value }, range))
}

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


// 获取AST对象上rawAttrsMap对应的属性值
export function getRawBindingAttr (
  el: ASTElement,
  name: string
) {
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}

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
