/* @flow */

import { makeMap } from 'shared/util'

// these are reserved for web because they are directly compiled away
// during template compilation
export const isReservedAttr = makeMap('style,class')

// attributes that should be using props for binding
// 应该使用 props 进行绑定的属性
const acceptValue = makeMap('input,textarea,option,select,progress')

// 必须使用prop进行绑定的属性，当做原生DOM属性处理
export const mustUseProp = (tag: string, type: ?string, attr: string): boolean => {
  // 传入的属性如果符合一下条件，需使用props绑定
  return (
    // attr是value、属于上面那些标签、type不是button
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    // attr是selected、标签是option
    (attr === 'selected' && tag === 'option') ||
    // attr是checked、标签是input
    (attr === 'checked' && tag === 'input') ||
    // attr是muted、标签是video
    (attr === 'muted' && tag === 'video')
  )
}

// 标签上的枚举属性
export const isEnumeratedAttr = makeMap('contenteditable,draggable,spellcheck')

//本来只有true和false，但vue允许contenteditable属性可以接收下面的值
const isValidContentEditableValue = makeMap('events,caret,typing,plaintext-only')

// 标签上的枚举属性，值只能为true和false其中一个
export const convertEnumeratedValue = (key: string, value: any) => {
  return isFalsyAttrValue(value) || value === 'false' //如果是假值，赋值为false
    ? 'false'
    // allow arbitrary string value for contenteditable
    : key === 'contenteditable' && isValidContentEditableValue(value) //如果是contenteditable属性可以接收的值
      ? value //那么则为该值
      : 'true' //否则就是true
}

// 标签上使用布尔类型作为属性值的属性
export const isBooleanAttr = makeMap(
  'allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,' +
  'default,defaultchecked,defaultmuted,defaultselected,defer,disabled,' +
  'enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,' +
  'muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,' +
  'required,reversed,scoped,seamless,selected,sortable,' +
  'truespeed,typemustmatch,visible'
)

export const xlinkNS = 'http://www.w3.org/1999/xlink'

// 判断属性是不是以xlink:开头的
export const isXlink = (name: string): boolean => {
  return name.charAt(5) === ':' && name.slice(0, 5) === 'xlink'
}

// 拿到xlink:后面的字符，如xlink:href，xlink:type后的href，type
export const getXlinkProp = (name: string): string => {
  return isXlink(name) ? name.slice(6, name.length) : ''
}

// 判断attr的值是不是null或者undefined或者false
export const isFalsyAttrValue = (val: any): boolean => {
  return val == null || val === false
}
