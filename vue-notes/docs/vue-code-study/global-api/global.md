# 全局方法

## 入口
:::tip 文件目录
/src/core/index.js
:::
```js
// 全局api入口
initGlobalAPI(Vue)
```
## initGlobalAPI  
定义一系列全局API 
* 全局默认配置：```Vue.config```
* 工具方法：```Vue.util.xx```
* 全局默认配置项```Vue.options.components、Vue.options.directives、Vue.options.filters、Vue.options._base```
* 全局方法``` Vue.set、Vue.delete、Vue.nextTick、Vue.observable、Vue.use、Vue.mixin、Vue.extend、Vue.component、Vue.directive、Vue.filter```
:::tip 文件目录
/src/core/global-api/index.js
:::
```js
export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  // 全局配置，做了层代理，Vue.config只读
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    // 修改Vue.config报错
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  // 定义全局配置
  Object.defineProperty(Vue, 'config', configDef)

  // 暴露的一些工具方法，除非你很熟悉这些方法，否则不要轻易使用
  Vue.util = {
    // 警告日志
    warn,
    // 工具函数的合并对象方法
    extend,
    // 合并选项
    mergeOptions,
    // 响应式处理
    defineReactive
  }

  // 设置Vue.set,Vue.delete,Vue.nextTick
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 设置Vue.observable
  Vue.observable = <T>(obj: T): T => {
    // 直接对传入的对象进行响应式处理
    observe(obj)
    // 返回该对象
    return obj
  }

  {/* 
      设置构造函数的options，即默认的配置项
      Vue.options:{
        components:{},
        directives:{},
        filters:{}
      }
  */}
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  {/*  将 Vue 构造函数挂载到 Vue.options._base 上 */}
  Vue.options._base = Vue

  {/* 向Vue.options.components添加内置组件，keep-alive */}
  extend(Vue.options.components, builtInComponents)

  {/* 设置Vue.use */}
  initUse(Vue)
  {/* 设置Vue.mixin */}
  initMixin(Vue)
  {/* 设置Vue.extend */}
  initExtend(Vue)
  {/* 设置Vue.component，Vue.directive，Vue.directive */}
  initAssetRegisters(Vue)
}
```
## Vue.set  
为数组或对象添加新的属性时，设置成响应式的
:::tip 文件目录
/src/core/observer/index.js
:::
```js
/**
直接为对象添加属性，不是响应式的，需使用set方法去设置
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    // null,undefined,4个原始类型不能使用set方法
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 如果是数组，且索引有效
    // 重新设置数组的长度
    target.length = Math.max(target.length, key);
    // 通过splice插入新的元素，即是响应式的
    target.splice(key, 1, val);
    return val;
  }
  if (key in target && !(key in Object.prototype)) {
    // 如果key值已经存在对象里，已经是响应式的，无需再处理，直接赋值即可
    target[key] = val;
    return val;
  }
  // 拿到目标对象的__ob__属性
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    // 如果进行设置的是vue实例或者是根属性$data，报错
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid adding reactive properties to a Vue instance or its root $data " +
          "at runtime - declare it upfront in the data option."
      );
    return val;
  }
  if (!ob) {
    // ob不存在，说明不是响应式对象，直接赋值即可
    target[key] = val;
    return val;
  }
  // ob存在，对新设置的值进行响应式处理
  defineReactive(ob.value, key, val);
  // 通知该属性dep收集的watcher进行更新
  ob.dep.notify();
  return val;
}
```
## Vue.delete
删除响应式的数组或对象属性时，进行通知更新
:::tip 文件目录
/src/core/observer/index.js
:::
```js
/**
 * 如果删除的元素是响应式的，需要通过del方法进行删除，才能是响应式的.
 */
export function del(target: Array<any> | Object, key: any) {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    // target不能为undefined，null,和4个原始类型
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 如果是数组且索引有效，直接调用splice进行删除
    target.splice(key, 1);
    return;
  }

  // 拿到目标对象的__ob__属性
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    // 如果删除的是vue实例或者是根属性$data的元素，报错
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid deleting properties on a Vue instance or its root $data " +
          "- just set it to null."
      );
    return;
  }
  if (!hasOwn(target, key)) {
    // 如果要删除的key在目标对象中不存在，直接返回
    return;
  }
  // 删除目标属性
  delete target[key];
  if (!ob) {
    // ob不存在，说明不是响应式对象，直接删除
    return;
  }
  // ob存在，通知该属性dep收集的watcher进行更新
  ob.dep.notify();
}
```

## Vue.nextTick
:point_right: [nextTick](../observe/queue.md#nexttick)

## Vue.observable
```js
// 设置Vue.observable
  Vue.observable = <T>(obj: T): T => {
    // 直接对传入的对象进行响应式处理
    observe(obj)
    // 返回该对象
    return obj
  }
```

## Vue.use
```Vue.use()```，负责为Vue安装插件
:::tip 文件目录
/src/core/global-api/use.js
:::
```js
export function initUse (Vue: GlobalAPI) { 
  /**
   * @description: 定义Vue.use，负责为Vue安装插件
   * @param {*} plugin plugin可以为一个方法或者对象
   * 对象形如{
   *    install:function(Vue){
   *    }
   * }
   */  
  Vue.use = function (plugin: Function | Object) {
    // 拿到Vue._installedPlugins，里面保存了所有注册过的插件，如果_installedPlugins不存在，就创建一下
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      // 如果插件注册过，就直接返回，防止重复安装
      return this
    }

    // 拿到除plugin以外的其他参数，转为真数组
    const args = toArray(arguments, 1)
    // 将Vue构造函数，放到参数的第一个位置，用来给插件使用
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      // 如果plugin是对象形式，执行install方法，把参数传递进去
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // 如果plugin是方法，直接执行并把参数传递进去
      plugin.apply(null, args)
    }
    // 将plugin推入installedPlugins数组中
    installedPlugins.push(plugin)
    return this
  }
}
```
## Vue.mixin
```Vue.mixin()```更新构造函数的options
:::tip 文件目录
/src/core/global-api/mixin.js
:::
```js
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 更新构造函数的options,this指向就是Vue
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
```

## Vue.extend
```Vue.extend()```返回一个VueComponent构造函数，该构造函数创建的实例的原型指向了基类的（Vue.prototype），也继承了基类的全局方法（extend,mixin,use）
:::tip 文件目录
/src/core/global-api/extend.js
:::
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

```

## Vue.component
## Vue.directive
## Vue.filter
这三个方法定义在initAssetRegisters方法中
:::tip 文件目录
/src/core/global-api/assets.js
:::

```js
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

```
 