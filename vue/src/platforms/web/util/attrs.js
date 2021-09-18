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

export const isEnumeratedAttr = makeMap('contenteditable,draggable,spellcheck')

const isValidContentEditableValue = makeMap('events,caret,typing,plaintext-only')

export const convertEnumeratedValue = (key: string, value: any) => {
  return isFalsyAttrValue(value) || value === 'false'
    ? 'false'
    // allow arbitrary string value for contenteditable
    : key === 'contenteditable' && isValidContentEditableValue(value)
      ? value
      : 'true'
}

export const isBooleanAttr = makeMap(
  'allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,' +
  'default,defaultchecked,defaultmuted,defaultselected,defer,disabled,' +
  'enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,' +
  'muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,' +
  'required,reversed,scoped,seamless,selected,sortable,' +
  'truespeed,typemustmatch,visible'
)

export const xlinkNS = 'http://www.w3.org/1999/xlink'

export const isXlink = (name: string): boolean => {
  return name.charAt(5) === ':' && name.slice(0, 5) === 'xlink'
}

export const getXlinkProp = (name: string): string => {
  return isXlink(name) ? name.slice(6, name.length) : ''
}

export const isFalsyAttrValue = (val: any): boolean => {
  return val == null || val === false
}
