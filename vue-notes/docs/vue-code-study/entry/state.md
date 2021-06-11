# 数据响应式  

## initState  
数据响应式的入口：处理 props、methods、data、computed、watch选项
::: tip 文件目录
/src/core/instance/state.js  
:::
```js
// 做了一层代理，当使用this.***访问时，实际上访问的是this[_data/_props][***]
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key];
  };
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val;
  };
  // 同时将属性定义到vm实例上
  Object.defineProperty(target, key, sharedPropertyDefinition);
}


//注意： 初始化的顺序不能乱，不然data中访问不到props，methods数据
export function initState(vm: Component) {
  vm._watchers = [];
  const opts = vm.$options;
  // 处理props对象
  if (opts.props) initProps(vm, opts.props);
  // 处理methods对象
  if (opts.methods) initMethods(vm, opts.methods);
  // 处理data
  if (opts.data) {
    initData(vm);
  } else {
    // data不存在，给个默认空对象
    observe((vm._data = {}), true /* asRootData */);
  }
  // 处理computed对象
  if (opts.computed) initComputed(vm, opts.computed);
  if (opts.watch && opts.watch !== nativeWatch) {
    // 处理watch对象
    initWatch(vm, opts.watch);
  }
}
```
### initProps  
处理props对象，props对象在合并选项时处理成了统一的形式，里面通过[validateProp](../util/util.md#validateprop)方法，对值进行校验

```js
/**
 * @description: 处理props对象，对每个属性做响应式处理，并将其代理到vm._props
 * @param {*} vm 传入的实例
 * @param {*} propsOptions 传入的vm.$options.props
 */
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}; //父组件传入的prop值
  const props = (vm._props = {});  //为实例创建_props,用来做代理
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = (vm.$options._propKeys = []);
  const isRoot = !vm.$parent; //是否是根组件
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false);
  }
  for (const key in propsOptions) {
    keys.push(key);
    // 拿到处理后的value值
    const value = validateProp(key, propsOptions, propsData, vm);
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== "production") {
      // key转成连字符
      const hyphenatedKey = hyphenate(key);
      if (
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        // 如果props的key是保留属性，报错
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        );
      }
      /* 
          父组件传来的值，已经做过响应式处理了，为什么这里还需要进行处理？
          这里其实是对_props最外层的键值进行响应式处理，当递归处理父组件传入的值时，
          observe会进行判断有没有__ob__,有就不会进行响应式处理了
      */
      // 响应式处理，并将得到的prop值都绑定到props上
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          // 不是根组件且没有更新子组件
          // 警告不能直接在子组件对prop赋值
          warn(
            `Avoid mutating a prop directly since the value will be ` +
              `overwritten whenever the parent component re-renders. ` +
              `Instead, use a data or computed property based on the prop's ` +
              `value. Prop being mutated: "${key}"`,
            vm
          );
        }
      });
    } else {
      // 响应式处理，并将得到的prop值都绑定到props上
      defineReactive(props, key, value);
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // propKey不存在实例上，则进行代理
    if (!(key in vm)) {
      // 访问vm.prop时，代理到_props上
      proxy(vm, `_props`, key);
    }
  }
  toggleObserving(true);
}
```
:::warning 注意
不能在子组件修改prop值，因为当修改prop值时，会触发set方法，set方法里调用了defineReactive传入的回调函数进行报错
:::

### initMethods   
 处理methods对象

```js
function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props;
  for (const key in methods) {
    if (process.env.NODE_ENV !== "production") {
      if (typeof methods[key] !== "function") {
        // 方法必须是个函数
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        );
      }
      if (props && hasOwn(props, key)) {
        // 方法名的与prop冲突了
        warn(`Method "${key}" has already been defined as a prop.`, vm);
      }
      if (key in vm && isReserved(key)) {
        // 方法名不能与已经在实例上存在的属性相同且不能以_或$开头
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        );
      }
    }
    // 将methods的方法放到实例上，就可以通过this.xxx访问了
    // 通过bind处理后，方法里的this就可以访问到当前实例了
    vm[key] =
      typeof methods[key] !== "function" ? noop : bind(methods[key], vm);
  }
}
```

### initData
