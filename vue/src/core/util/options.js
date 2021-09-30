/* @flow */

import config from "../config";
import { warn } from "./debug";
import { set } from "../observer/index";
import { unicodeRegExp } from "./lang";
import { nativeWatch, hasSymbol } from "./env";

import { ASSET_TYPES, LIFECYCLE_HOOKS } from "shared/constants";

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject,
} from "shared/util";

/*
    合并策略
    比如methods里面挂载的方法可能相同也可能不同，合并策略决定要如何合并
    options:{
      el      //el合并策略
      data    //data合并策略
      methods //methods合并策略
      ...
    }
   
 */
const strats = config.optionMergeStrategies;

/**
 对el和propsData处理是直接返回了默认策略
 */
if (process.env.NODE_ENV !== "production") {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      /*
        只要未传入vm变量，options中就不能声明这两个字段
        比如this._init()中的mergeOptions传入了vm
        Vue.mixin(),Vue.extend()中的mergeOptions没有传入了vm
        所以Vue.mixin(),Vue.extend()中不能使用el和propsData参数，只能new实例的时候使用
      */
      warn(
        `option "${key}" can only be used during instance ` +
          "creation with the `new` keyword."
      );
    }
    return defaultStrat(parent, child);
  };
}

/**
  对数据进行合并,to（childVal）在from（parentVal）中没有的属性会进行添加，有就不进行处理
 */
function mergeData(to: Object, from: ?Object): Object {
  if (!from) return to;
  let key, toVal, fromVal;

  // 拿到对象的所有属性
  const keys = hasSymbol ? Reflect.ownKeys(from) : Object.keys(from);

  for (let i = 0; i < keys.length; i++) {
    key = keys[i];
    // 如果是__ob__,说明该属性时观察者实例，跳过
    if (key === "__ob__") continue;
    toVal = to[key];
    fromVal = from[key];
    if (!hasOwn(to, key)) {
      // 如果to没有该属性，为to添加该属性
      set(to, key, fromVal);
    } else if (
      // 如果to,from都有该属性，判断to,from相等且是否为对象，成立的话继续递归判断
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal);
    }
  }
  // 返回to
  return to;
}


export function mergeDataOrFn(
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // Vue.extend(), Vue.mixin()里的mergeOptions()走这里
    // 当parentVal，childVal只存在一个时，data为该值
    if (!childVal) {
      return parentVal;
    }
    if (!parentVal) {
      return childVal;
    }

    // 当两个parentVal，childVal都存在时，返回为一个方法，此时构造函数中的options.data为一个方法
    // 当通过new关键字初始化时，执行init里的mergeOptions会走下面的判断，此时mergedDataFn变成了下面的parentVal
    // 所以this就指向vm
    return function mergedDataFn() {
      return mergeData(
        typeof childVal === "function" ? childVal.call(this, this) : childVal,
        typeof parentVal === "function" ? parentVal.call(this, this) : parentVal
      );
    };
  } else {
    // new走这里
    // 实例选项的$options.data实际为返回的mergedInstanceDataFn(),在initData时会用到
    return function mergedInstanceDataFn() {
      // 实例数据，通过new关键字实例化传进来的data
      const instanceData =
        typeof childVal === "function" ? childVal.call(vm, vm) : childVal;
      //默认数据,构造函数中options的data
      const defaultData =
        typeof parentVal === "function" ? parentVal.call(vm, vm) : parentVal;
      // new Vue()中传入了data才进行合并
      if (instanceData) {
        return mergeData(instanceData, defaultData);
      } else {
        return defaultData;
      }
    };
  }
}

strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 如果vm不存在,为Vue.mixin和Vue.extends调用
    if (childVal && typeof childVal !== "function") {
      // 所以在Vue.mixin和Vue.extends中，data都必须为函数，不然会报错
      process.env.NODE_ENV !== "production" &&
        warn(
          'The "data" option should be a function ' +
            "that returns a per-instance value in component " +
            "definitions.",
          vm
        );
      //如果childVal的data不是function,返回parentVal，不进行合并
      return parentVal;
    }
    return mergeDataOrFn(parentVal, childVal);
  }

  //vm存在时，比如new Vue()走这里
  return mergeDataOrFn(parentVal, childVal, vm);
};

/**
生命周期合并后为数组形式，按数组的循序执行
 */
function mergeHook(
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  // 三目转化为if语句
  // if (childVal) {
  //   if (parentVal) {
  //     let res = parentVal.concat(childVal);
  //   } else {
  //     if (Array.isArray(childVal)) {
  //       let res = childVal;
  //     } else {
  //       let res = [childVal];
  //     }
  //   }
  // } else {
  //   let res = parentVal;
  // }
  // 最终返回的生命周期钩子函数为数组形式，
  // 按数组顺序执行
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
      ? childVal
      : [childVal]
    : parentVal;
  return res ? dedupeHooks(res) : res;
}

// 剔除选项合并数组中的重复值
function dedupeHooks(hooks) {
  const res = [];
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i]);
    }
  }
  return res;
}

// LIFECYCLE_HOOKS为生命周期常量数组
LIFECYCLE_HOOKS.forEach((hook) => {
  strats[hook] = mergeHook;
});

/**
 directives、filters、components合并策略和methods等相似
 合并之后parentVal都隐藏到了对象的原型上面去了，所以内置的组件，指令可以直接使用，vue并没有显式的去注册他们
 */
function mergeAssets(
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 创建建一个空对象，parentVal存在，该对象的原型则指向parentVal，否则该对象没有原型链
  const res = Object.create(parentVal || null);
  if (childVal) {
    process.env.NODE_ENV !== "production" &&
      assertObjectType(key, childVal, vm);
    return extend(res, childVal);
  } else {
    return res;
  }
}

// directives、filters、components
ASSET_TYPES.forEach(function (type) {
  strats[type + "s"] = mergeAssets;
});

/*
    watch合并策略
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined;
  if (childVal === nativeWatch) childVal = undefined;
  /* istanbul ignore if */
  // 1.childVal不存在，创建空对象，原型指向parentVal
  if (!childVal) return Object.create(parentVal || null);
  if (process.env.NODE_ENV !== "production") {
    assertObjectType(key, childVal, vm);
  }
  // 2.childVal存在，parentVal不存在，直接返回childVal
  if (!parentVal) return childVal;
  // 3.执行到这说明parentVal，childVal都存在
  const ret = {};
  extend(ret, parentVal);
  // 将监听的字段转换成数组，重复的名字，也直接塞进数组，和生命周期合并策略类似
  /*
  xxx为监听的数据
  ret最终的形式为：{
    xxx:[]
    xxx:[]
  }
  */
  for (const key in childVal) {
    let parent = ret[key];// childVal的key,在parentVal中的值，看是否存在
    const child = childVal[key];// childVal的值
    if (parent && !Array.isArray(parent)) {
      // 存在且parent不是数组，则转为数组
      parent = [parent];
    }
    // 判断parent存在则将child组合成数组,不存在再判断child是否是数组，不是转为数组
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child)
      ? child
      : [child];
  }
  return ret;
};

/*
  props、methods、inject、computed这几个固定都是对象类型（props与inject会被规范化成对象类型）
  同名的选项直接覆盖
 */
strats.props =
  strats.methods =
  strats.inject =
  strats.computed =
    function (
      parentVal: ?Object,
      childVal: ?Object,
      vm?: Component,
      key: string
    ): ?Object {
      if (childVal && process.env.NODE_ENV !== "production") {
        // 检验传入的是否是对象类型
        assertObjectType(key, childVal, vm);
      }
      if (!parentVal) return childVal;
      const ret = Object.create(null);
      extend(ret, parentVal);
      if (childVal) extend(ret, childVal);
      return ret;
    };

//provide合并策略与data的一样
strats.provide = mergeDataOrFn;

/**
  默认策略
  当找不到合并策略时，使用默认策略
  默认策略为如果child存在，直接覆盖
 */
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined ? parentVal : childVal;
};

/**
 校验组件名字是否符合规范
 */
function checkComponents(options: Object) {
  for (const key in options.components) {
    validateComponentName(key);
  }
}

export function validateComponentName(name: string) {
  // Vue 限定组件的名字由普通的字符和中横线(-)组成，且必须以字母开头。
  if (
    !new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)
  ) {
    warn(
      'Invalid component name: "' +
        name +
        '". Component names ' +
        "should conform to valid custom element name in html5 specification."
    );
  }
  // 组件名字不能是Vue内置组件的名字，如slot,component
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      "Do not use built-in or reserved HTML elements as component " +
        "id: " +
        name
    );
  }
}

/**
 normalizeProps函数将props的不同形式转化为对象的基本格式{ ***: { type: *** } }
 */
function normalizeProps(options: Object, vm: ?Component) {
  const props = options.props;
  if (!props) return;
  const res = {};
  let i, val, name;
  // props是数组类型
  // props: [ 'someObjA', 'someObjB' ]
  if (Array.isArray(props)) {
    i = props.length;
    while (i--) {
      val = props[i];
      if (typeof val === "string") {
        name = camelize(val); //将名字转化为小驼峰
        // 将props转化成{'someObjA':{type:null}}的形式
        res[name] = { type: null };
      } else if (process.env.NODE_ENV !== "production") {
        // 数组里不是字符串会报警告
        warn("props must be strings when using array syntax.");
      }
    }
    // 对象类型的props
    // props: { someObjA: String }
    // props: { someObjA: [ Number, String ] }
    // props: { someObjA: { type: Number, default: 1 } }
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key];
      name = camelize(key);
      res[name] = isPlainObject(val) ? val : { type: val };
    }
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
        `but got ${toRawType(props)}.`,
      vm
    );
  }
  options.props = res;
}

/*
 provide:{
   foo:"foo"
 }
 inject:["foo"],
 inject:{ str: { from: "foo" }},
 inject:{ str:"foo" }
 normalizeInject函数将上面的三种形式全部转化为{ str: { from: "foo" }}的形式
 */
function normalizeInject(options: Object, vm: ?Component) {
  const inject = options.inject;
  if (!inject) return;
  const normalized = (options.inject = {});
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] };
    }
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key];
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val };
    }
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
        `but got ${toRawType(inject)}.`,
      vm
    );
  }
}

/*
  normalizeDirectives函数同样统一处理成了对象类型
  处理前
  directives: {
      b: function () {
        console.log('v-b')
      }
  }
  处理后
  directives: {
      b: {
          bind: function(){
              console.log('v-b')
          },
          update: function(){
              console.log('v-b')
          }
      }
  }
*/
function normalizeDirectives(options: Object) {
  const dirs = options.directives;
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key];
      if (typeof def === "function") {
        dirs[key] = { bind: def, update: def };
      }
    }
  }
}

// 检验传入的是否是对象类型
function assertObjectType(name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
        `but got ${toRawType(value)}.`,
      vm
    );
  }
}

/**
合并选项
 */
export function mergeOptions(
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== "production") {
    // 校验名字
    checkComponents(child);
  }

  if (typeof child === "function") {
    child = child.options;
  }

  // 对属性的不同格式转化成统一形式
  normalizeProps(child, vm);
  normalizeInject(child, vm);
  normalizeDirectives(child);

  if (!child._base) {
    // child存在extends选项，将extends内容合并到父对象parent中,
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm);
    }
    // child存在mixins选项，将mixins内容合并到父对象parent中,mixins是数组
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm);
      }
    }
  }

  const options = {};
  let key;
  for (key in parent) {
    mergeField(key);
  }
  for (key in child) {
    // 如果child中包含parent没有的元素,也进行合并
    if (!hasOwn(parent, key)) {
      mergeField(key);
    }
  }
  // 合并options
  function mergeField(key) {
    // 对options里的元素选择对应的合并策略
    const strat = strats[key] || defaultStrat; //找不到策略，选择默认策略
    options[key] = strat(parent[key], child[key], vm, key); //返回合并完的数据
  }
  return options;
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
/*
  $options.components，$options.directives，$options.filters
  判断传入的字符是否存在于指定选项中
*/
export function resolveAsset(
  options: Object, //指定的选项
  type: string,  // 为components或者directives或者filters
  id: string, //该组件的名称
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== "string") {
    // 如果不是字符，直接返回
    return;
  }
  // 拿到对应选项
  const assets = options[type];
  // check local registration variations first

  // hasOwn检查对象是否含有该属性，但不会再原型链上查找
  // 先检查字符是否存在于选项中
  if (hasOwn(assets, id)) return assets[id];

  // 将字符转为驼峰，继续查找
  const camelizedId = camelize(id);
  if (hasOwn(assets, camelizedId)) return assets[camelizedId];

  // 将字符转为首字母大写，继续查找
  const PascalCaseId = capitalize(camelizedId);
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId];
  // fallback to prototype chain

  // 要是还没找到，则在原型链上查找
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId];
  if (process.env.NODE_ENV !== "production" && warnMissing && !res) {
    // 找不到，报错
    warn("Failed to resolve " + type.slice(0, -1) + ": " + id, options);
  }
  // 返回找到的结果
  return res;
}
