/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'


// 模板编译的默认配置选项
export const baseOptions: CompilerOptions = {
  expectHTML: true,
  // 数组，数组有三个元素，内容来自于modules下的三个文件夹
  modules,
  // directives 值是三个属性 (model、text、html) 的对象，且属性的值都是函数。
  directives,
  // isPreTag 是一个函数，判断传入的标签名字是不是pre标签
  isPreTag,
  // isPreTag 是一个函数，判断传入的标签是不是一元标签
  isUnaryTag,
  // mustUseProp是一个函数，判断传入的属性是不是要用prop进行绑定，当做原生DOM属性处理
  mustUseProp,
  // canBeLeftOpenTag是一个函数，判断是不是非一元标签，却可以自己补全并闭合的标签，
  canBeLeftOpenTag,
  // isReservedTag 是一个函数，判断是不是保留标签
  isReservedTag,
  // getTagNamespace 是一个函数，获取标签的命名空间
  getTagNamespace,
  // "staticClass,staticStyle"字符串
  staticKeys: genStaticKeys(modules)
}
