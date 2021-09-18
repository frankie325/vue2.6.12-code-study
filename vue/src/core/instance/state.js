/* @flow */

import config from "../config";
import Watcher from "../observer/watcher";
import Dep, { pushTarget, popTarget } from "../observer/dep";
import { isUpdatingChildComponent } from "./lifecycle";

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving,
} from "../observer/index";

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling,
} from "../util/index";

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop,
};

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

/**
 * @description: 处理props对象，对每个属性做响应式处理，并将其代理到vm._props
 * @param {*} vm 传入的实例
 * @param {*} propsOptions 传入的vm.$options.props
 */
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}; //父组件传入的prop值
  const props = (vm._props = {}); //为实例创建_props,用来做代理
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

function initData(vm: Component) {
  //初始化数据
  let data = vm.$options.data;
  data = vm._data = typeof data === "function" ? getData(data, vm) : data || {};
  if (!isPlainObject(data)) {
    //data如果还不是返回一个对象(比如data是一个数组)，会报警告函数应该返回一个对象
    data = {};
    process.env.NODE_ENV !== "production" &&
      warn(
        "data functions should return an object:\n" +
          "https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function",
        vm
      );
  }
  // proxy data on instance
  // 下面的代码，data,props,methods名字不能重复
  const keys = Object.keys(data);
  const props = vm.$options.props;
  const methods = vm.$options.methods;
  let i = keys.length;
  while (i--) {
    // 遍历data
    const key = keys[i];
    if (process.env.NODE_ENV !== "production") {
      // 不能与methods的key重复
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        );
      }
    }
    // 不能与props的key重复
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== "production" &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        );
    } else if (!isReserved(key)) {
      // isReserved检查是不是以$和_字符开头的属性
      // 不是，才会将data代理到vm._data上
      proxy(vm, `_data`, key);
    }
  }
  // 响应式处理，这个data是vm._data
  observe(data, true /* asRootData */);
}

/*
传入的data为合并data选项时返回的mergedInstanceDataFn方法
*/
export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 初始化数据的时候，不用去收集依赖，因为data中可以访问this['prop键值']，会触发prop的get
  pushTarget();
  try {
    return data.call(vm, vm); 
  } catch (e) {
    handleError(e, vm, `data()`);
    return {};
  } finally {
    popTarget();
  }
}

const computedWatcherOptions = { lazy: true };

function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  /*
  相当于
  vm._computedWatchers = Object.create(null)
  const watchers = vm._computedWatchers
  */
  const watchers = (vm._computedWatchers = Object.create(null));
  // computed properties are just getters during SSR
  const isSSR = isServerRendering();

  // 遍历 computed 对象
  for (const key in computed) {
    const userDef = computed[key]; //获取 key 对应的值
    // computed的值有两种形式，1.函数 2.对象形式，里面有get，set方法
    // 是函数？将函数形式赋值给getter : 使用对象形式里的get
    const getter = typeof userDef === "function" ? userDef : userDef.get;
    if (process.env.NODE_ENV !== "production" && getter == null) {
      // 找不到getter,报错
      warn(`Getter is missing for computed property "${key}".`, vm);
    }

    if (!isSSR) {
      //为每一个computed的属性创建一个 watcher 实例，并挂载到vm._computedWatchers对象里
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      );
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      // computed对象中的属性还不存在实例上
      // 则代理 computed 对象中的属性到 vm 实例，就可以通过this.xxx访问了
      defineComputed(vm, key, userDef);
    } else if (process.env.NODE_ENV !== "production") {
      // 判重
      if (key in vm.$data) {
        // key与data中的key重复
        warn(`The computed property "${key}" is already defined in data.`, vm);
      } else if (vm.$options.props && key in vm.$options.props) {
        // key与props中的key重复
        warn(
          `The computed property "${key}" is already defined as a prop.`,
          vm
        );
      } else if (vm.$options.methods && key in vm.$options.methods) {
        // key与methods中的key重复
        warn(
          `The computed property "${key}" is already defined as a method.`,
          vm
        );
      }
    }
  }
}

// 定义计算属性的get和set，就是做了一层代理
export function defineComputed(
  target: any,
  key: string, //计算属性的key
  userDef: Object | Function //key对应的value
) {
  // 不是服务端渲染，shouldCache为true
  const shouldCache = !isServerRendering();
  if (typeof userDef === "function") {
    // 是方法
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef);
    sharedPropertyDefinition.set = noop;
  } else {
    //是对象
    // 当为对象时，可以传入cache参数，设置为false不会对计算属性进行缓存
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop;
    // set为自定义的set方法
    sharedPropertyDefinition.set = userDef.set || noop;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    sharedPropertyDefinition.set === noop
  ) {
    // 如果set不存在，当改变计算属性的时候，会调用该方法报错
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      );
    };
  }
  // 将计算属性定义到实例上
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

// 返回一个函数，当通过this.xxx访问计算属性时，执行返回的computedGetter
function createComputedGetter(key) {
  return function computedGetter() {
    // 拿到该属性的computedWatchers
    const watcher = this._computedWatchers && this._computedWatchers[key];
    if (watcher) {
      /*
        watcher.dirty属性computed 计算结果会缓存的原理
        <template>
          <div>{{ computedProperty }}</div>
          <div>{{ computedProperty }}</div>
        </template>
        像这种情况下，在页面的一次渲染中，两个 dom 中的 computedProperty 只有第一个会执行watcher.evaluate()
        第二个computedProperty执行get时，watcher.dirty就是false了，直接使用watcher.value
        当计算属性依赖的变量更新时，（依赖的变量收集的watcher,就是该计算属性创建的computedWatcher）watcher.update会将 watcher.dirty 重新置为 true
        下次页面更新时重新计算结果
      */
      if (watcher.dirty) {
        // 执行完evaluate后，watcher.dirty置为false
        watcher.evaluate();
      }
      /*
      计算属性依赖的变量没有展示在页面中，1.那么依赖的变量何时收集的computedWatcher，2.又是怎么收集的渲染watcher，去更新页面呢?
      <template>
          <div>{{ computedProperty }}</div>
      </template>
      1.当在页面访问computedProperty的时候，调用watcher.evaluate()里的this.get，
      this.get执行的方法就是计算属性传入的getter方法，里面对依赖变量进行了访问
      触发依赖变量的get方法，将computedWatcher添加到依赖变量的dep实例中，同时computedWatcher也添加了所有依赖变量的dep实例
      2.watcher.evaluate()执行完后又调用了popTarget()，将computedWatcher从targetStack队列中剔除，此时Dep.target为组件的渲染watcher
      执行下面的watcher.depend()，会遍历computedWatcher在上一步收集到的所有依赖变量的dep实例，将渲染watcher添加到dep实例
      所以当依赖变量更新时，页面也会进行更新。
      妙哇，妙哇
      */
      if (Dep.target) {
        watcher.depend();
      }
      // 返回computedWatcher得到的
      return watcher.value;
    }
  };
}

// 服务端渲染，则返回该方法，此时计算属性不会对结果进行缓存
function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this);
  };
}

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

/*
watch可以传入下面多种形式
watch: {
    a: function (val, oldVal) {
      console.log('new: %s, old: %s', val, oldVal)
    },
     方法名
    b: 'someMethod',
     该回调会在任何被侦听的对象的 property 改变时被调用，不论其被嵌套多深
    c: {
      handler: function (val, oldVal) {  },
      deep: true
    },
     该回调将会在侦听开始之后被立即调用
    d: {
      handler: 'someMethod',
      immediate: true
    },
     你可以传入回调数组，它们会被逐一调用
    e: [
      'handle1',
      function handle2 (val, oldVal) {  },
      {
        handler: function handle3 (val, oldVal) {  },
        
      }
    ],
    'e.f': function (val, oldVal) {  }
  }
*/
function initWatch(vm: Component, watch: Object) {
  for (const key in watch) {
    // 遍历watch,拿到value
    const handler = watch[key];
    if (Array.isArray(handler)) {
      // 如果是数组，遍历
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}

// 通过$watch创建观察者实例
function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any, //字符串，对象，或者方法
  options?: Object
) {
  if (isPlainObject(handler)) {
    // handler是对象
    options = handler; //对象里的参数，deep和immediate
    handler = handler.handler; //对象里的handler函数
  }
  if (typeof handler === "string") {
    // handler是字符串，拿到对应的方法
    handler = vm[handler];
  }
  // 通过$watch进行观察
  return vm.$watch(expOrFn, handler, options);
}

// 设置Vue原型上的属性和方法，$data，$props，$set，$del，$watch
export function stateMixin(Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  // 定义$data的get方法
  const dataDef = {};
  dataDef.get = function () {
    return this._data;
  };
  // 定义$props的get方法
  const propsDef = {};
  propsDef.get = function () {
    return this._props;
  };

  // 修改$data和$props时会报错
  if (process.env.NODE_ENV !== "production") {
    dataDef.set = function () {
      warn(
        "Avoid replacing instance root $data. " +
          "Use nested data properties instead.",
        this
      );
    };
    propsDef.set = function () {
      warn(`$props is readonly.`, this);
    };
  }

  // 定义$data和$props，用户可以通过 vm.$data 访问原始数据对象，实际是访问实例的_data,_props
  Object.defineProperty(Vue.prototype, "$data", dataDef);
  Object.defineProperty(Vue.prototype, "$props", propsDef);

  // 原型上定义$set，$del，$watch方法
  Vue.prototype.$set = set;
  Vue.prototype.$delete = del;

  /*
  $watch的绑定方式
   1.键路径
    vm.$watch('a.b.c', function (newVal, oldVal) {
      做点什么
    },{})

   2.函数
    vm.$watch(
      function () {
      表达式 `this.a + this.b` 每次得出一个不同的结果时
      处理函数都会被调用。
      这就像监听一个未被定义的计算属性
        return this.a + this.b
      },
      function (newVal, oldVal) {
        做点什么
      }
    )
    3.对象形式
    vm.$watch('a.b.c', {
      handler:function(newVal, oldVal){}
    })
  */
  Vue.prototype.$watch = function (
    expOrFn: string | Function, //传入的键值或者方法
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this;
    if (isPlainObject(cb)) {
      // 如果传入的cb回调函数是对象，调用createWatcher
      return createWatcher(vm, expOrFn, cb, options);
    }
    options = options || {}; //拿到参数
    options.user = true;
    // 创建watcher实例
    const watcher = new Watcher(vm, expOrFn, cb, options);
    if (options.immediate) {
      // 如果immediate为true，说明立即执行
      const info = `callback for immediate watcher "${watcher.expression}"`;
      //此时Dep.target为targetStack栈上一个watcher实例，不是当前watcher实例（new完之后就从栈中移除了）
      //Dep.target置为undefined，当立即执行传入的回调时，里面访问的变量就不会进行依赖收集了
      pushTarget();
      // 执行传入的回调，因为可能包含异步操作，进行错误拦截处理
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info);
      popTarget();
    }
    // 返回一个函数，用来取消观察
    return function unwatchFn() {
      watcher.teardown();
    };
  };
}
