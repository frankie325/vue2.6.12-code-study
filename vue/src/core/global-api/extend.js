/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  Vue.cid = 0 //基类实例的cid为0
  let cid = 1 //像vue.extend继承的cid

  /**
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    
    extendOptions = extendOptions || {}
    const Super = this//this为Vue基类构造函数
    const SuperId = Super.cid
    // 给传入的extendOptions添加一个_Ctor对象，该对象会保存创建的子类Sub
    // 如果多次调用Vue.extend，传入的extendOptions都是同一个对象，所以会存在_Ctor对象，
    // 直接使用_Ctor对象里的缓存
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      // 直接返回缓存
      return cachedCtors[SuperId]
    }

    // 校验传入的name属性
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

      /* 
        Vue.extend方法执行后返回的构造函数VueComponent，
        VueComponent继承自基类
      */
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // Sub实例原型继承了基类的原型（Vue.prototype）
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 子类的options整合了父类的options和Vue.extend(options)里传入的options
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    // 记录自己的基类
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) {
      // 初始化整合后的Sub.options.props
      initProps(Sub)
    }
    if (Sub.options.computed) {
      // 初始化整合后的Sub.options.computed
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 继承基类的公共方法
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // name存在的话，则将自己注册到自己的 components 选项中
    // 递归组件的原理
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options//为父级的options
    Sub.extendOptions = extendOptions//为Vue.extend(options)里的options
    Sub.sealedOptions = extend({}, Sub.options) //Sub.options的拷贝（缓存），用来在resolveConstructorOptions中判断options是否更新（sealedOptions的值初始时就已经确定，不会再进行更改）

    // 给extendOptions._Ctor添加Sub，进行缓存
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  // 将props代理到 Sub.prototype._props 对象上，
  // 这样每个创建的子类实例都可以通过this.propKey访问到
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    // 将计算属性定义到Sub.prototype上，
    // 这样每个创建的子类实例可以通过this.computedKey方式访问
    defineComputed(Comp.prototype, key, computed[key])
  }
}
