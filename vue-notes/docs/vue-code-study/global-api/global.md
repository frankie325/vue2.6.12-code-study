# 全局方法1
:::tip 文件目录
/src/core/global-api
:::
## Vue.extend
```Vue.extend()```返回一个VueComponent构造函数，该构造函数创建的实例的原型指向了基类的（Vue.prototype），也继承了基类的全局方法（extend,mixin,use）
```js
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
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

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
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
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
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options//为父级的options
    Sub.extendOptions = extendOptions//为Vue.extend(options)里的options
    Sub.sealedOptions = extend({}, Sub.options) //Sub.options的拷贝（缓存），用来在resolveConstructorOptions中判断options是否更新（sealedOptions的值初始时就已经确定，不会再进行更改）

    // cache constructor
    cachedCtors[SuperId] = Sub
    return Sub
  }
}
```
## Vue.mixin
```Vue.mixin()```更新构造函数的options
```js
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 更新构造函数的options
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
```