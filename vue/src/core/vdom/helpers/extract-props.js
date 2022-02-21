/* @flow */

import {
  tip,
  hasOwn,
  isDef,
  isUndef,
  hyphenate,
  formatComponentName
} from 'core/util/index'


/*
  子组件定义的props选项，以选项中的属性为key，找到在父组件中对应的的数据
  作为子组件的propsData参数。
  当父组件数据更新时，重新渲染，会再次调用方法，重新获取最新的值
*/
export function extractPropsFromVNodeData (
  data: VNodeData,
  Ctor: Class<Component>,
  tag?: string
): ?Object {
  // 这里我们只提取原始值，验证和默认值在该子组件中处理
  // we are only extracting raw values here.
  // validation and default values are handled in the child
  // component itself.

  // 拿到组件的 props 选项，因为Ctor由Vue.extend生成，子类构造函数上的options中包含了props选项
  const propOptions = Ctor.options.props
  if (isUndef(propOptions)) {
    // 没有则返回
    return
  }
  const res = {}
  const { attrs, props } = data //attrs为组件上绑定的属性，由编译器解析得到，props为渲染函数传递的
  if (isDef(attrs) || isDef(props)) { //如果存在data.attrs和data.props，说明组件上是绑定了属性的
    // 遍历props选项
    for (const key in propOptions) {
      const altKey = hyphenate(key) //key转为连字符
      if (process.env.NODE_ENV !== 'production') {
        const keyInLowerCase = key.toLowerCase() //key转为小写形式
        if (
          key !== keyInLowerCase && //props中的key不是小写形式
          attrs && hasOwn(attrs, keyInLowerCase) //且在绑定的属性中存在
        ) {
          // 说明在组件上绑定属性时，用的是驼峰写法，因为html不区分大小写，所以会警告应该使用连字符
          tip(
            `Prop "${keyInLowerCase}" is passed to component ` +
            `${formatComponentName(tag || Ctor)}, but the declared prop name is` +
            ` "${key}". ` +
            `Note that HTML attributes are case-insensitive and camelCased ` +
            `props need to use their kebab-case equivalents when using in-DOM ` +
            `templates. You should probably use "${altKey}" instead of "${key}".`
          )
        }
      }
      checkProp(res, props, key, altKey, true) ||
      checkProp(res, attrs, key, altKey, false)
    }
  }
  return res
}

function checkProp (
  res: Object,
  hash: ?Object,
  key: string,
  altKey: string,
  preserve: boolean
): boolean {
  if (isDef(hash)) {
    if (hasOwn(hash, key)) {
      // 将属性在父组件对应的数据，添加到res上
      res[key] = hash[key]
      if (!preserve) {
        // preserve为false，则从attrs中删除
        // 所以如果组件上的属性作为props传递到了子组件，就不会再渲染到根标签了
        delete hash[key]
      }
      return true
    } else if (hasOwn(hash, altKey)) {
      // 如果原始的key没找到，把key转为连字符再去找
      res[key] = hash[altKey]
      if (!preserve) {
        delete hash[altKey]
      }
      return true
    }
  }
  return false
}
