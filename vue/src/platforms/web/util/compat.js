/* @flow */

import { inBrowser } from 'core/util/index'

// check whether current browser encodes a char inside attribute values
// 检查当前浏览器是否在属性值中对字符进行编码
// 在获取innerHTML内容时,换行符被转换成了&#10。会影响Vue的的编译结果
// 所以使用shouldDecodeNewlines，shouldDecodeNewlinesForHref两个选项做兼容处理
let div
function getShouldDecode (href: boolean): boolean {
  div = div || document.createElement('div')
  div.innerHTML = href ? `<a href="\n"/>` : `<div a="\n"/>`
  // 如果返回的索引大于0，则说明会进行编码
  return div.innerHTML.indexOf('&#10;') > 0
}

// 因为浏览器会对上面的字符进行编码，所以解析模板字符串时需要解码

// #3663: IE encodes newlines inside attribute values while other browsers don't
// IE 会对属性值内的换行符进行编码，而其他浏览器则不会
// 判断属性内的值会不会进行编码
export const shouldDecodeNewlines = inBrowser ? getShouldDecode(false) : false
// #6828: chrome encodes content in a[href]
// chrome 对 a[href] 中的内容进行编码
// 判断a标签属性内的值会不会进行编码
export const shouldDecodeNewlinesForHref = inBrowser ? getShouldDecode(true) : false
