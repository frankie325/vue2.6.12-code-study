/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  // 定义Vue.component，Vue.directive，Vue.filter方法
  // 将对应方法的第二个参数形式进行统一，并添加到Vue构造函数选项中，进行全局注册
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        // 如果没有传第二个参数，返回已存在的
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          // 如果是组件，校验传入的组件名字
          validateComponentName(id)
        }
        /*
          创建组件的两种形式
          Vue.component(xxx,Vue.extend());
          Vue.component(xxx,{
            选项...
          })
        */
        if (type === 'component' && isPlainObject(definition)) {
          // 如果是对象形式
          definition.name = definition.name || id //组件的名称，存在name参数，使用name参数，否则使用传入的第一个参数
          // 调用Vue.extend(),definition变为返回的子类构造函数
          definition = this.options._base.extend(definition)
        }
         /*
          创建自定义指令的两种形式
          Vue.component(xxx,function(){});
          Vue.component(xxx,{
            bind: function () {},
            指令生命周期钩子,...
          })
        */
        if (type === 'directive' && typeof definition === 'function') {
          // 如果是函数形式，bind，update钩子就是该函数
          definition = { bind: definition, update: definition }
        }
        // 将definition添加到Vue.options.components/directives/filters中，即全局注册
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
