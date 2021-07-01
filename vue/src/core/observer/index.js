/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import { arrayMethods } from "./array";
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
} from "../util/index";

// 获取对象属性名称的数组集合
const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;
// 可以理解为数据观测的开关。这个是控制是否为对象创建Observer实例，也就是挂载__ob__，但是并不妨碍直接使用defineReactive进行响应式处理
export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any; //传入的值，数组或者对象
  dep: Dep; //Dep实例，依赖管理（收集watcher）
  vmCount: number; // 该实例被调用的次数

  constructor(value: any) {
    this.value = value;
    this.dep = new Dep();
    this.vmCount = 0;
    // 将Observer实例挂到__ob__上，且该key值不可遍历
    def(value, "__ob__", this);
    if (Array.isArray(value)) {
      // 如果是数组，对数组原型重新指定，指向新改修的arrayMethods
      if (hasProto) {
        //这个判断是做兼容处理
        protoAugment(value, arrayMethods);
      } else {
        copyAugment(value, arrayMethods, arrayKeys);
      }
      // 数组的响应式处理
      this.observeArray(value);
    } else {
      // 对象的响应式处理
      this.walk(value);
    }
  }

  /*
    对象响应式处理
    初始化实例时会对属性执行 getter/setter 转化，
    后期向对象中新添加的key是不会进行响应式处理的
    所以必须在data对象上存在的属性才能将它转换为响应式的
   */
  walk(obj: Object) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      // 遍历对象，进行响应式处理（响应式核心）
      defineReactive(obj, keys[i]);
    }
  }

  /**
   遍历数组，对数组里的对象进行响应式处理
   所以如官网所说
   Vue 不能检测以下数组的变动：
      1.当你利用索引直接设置一个数组项时，例如：vm.items[indexOfItem] = newValue
      2.当你修改数组的长度时，例如：vm.items.length = newLength
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      // observe方法内，如果数组内的元素不是对象或数组，会直接返回
      observe(items[i]);
    }
  }
}

// helpers

/**
  改写数组的7个方法添加到目标数组上
 */
function protoAugment(target, src: Object) {
  // 直接添加到数组的__proto__上
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
  改写数组的7个方法添加到目标数组上
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    // 直接将对应的7个方法，添加到目标数组上
    def(target, key, src[key]);
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: any, asRootData: ?boolean): Observer | void {
  // 如果不是对象或者是VNode，直接返回
  if (!isObject(value) || value instanceof VNode) {
    return;
  }
  let ob: Observer | void;
  // __ob__为当前数据绑定的观察者Observe对象，如果存在了，则不必重复绑定
  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    ob = value.__ob__;
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    /* 
    满足所有条件才会创建观察者实例
    1.shouldObserve为true
    2.不是服务端渲染
    3.为数组或对象
    4.可扩展（是否可以在它上面添加新的属性）
    5._isVue为true,（_isVue在_init()方法里设置为true），即传入的value不能是vue实例
     */
    ob = new Observer(value);
  }
  if (asRootData && ob) {
    // observe传入的第二个参数为true才会执行
    ob.vmCount++;
  }
  return ob;
}

/*
  为什么要创建两个dep?(Observer中创建的Dep实例 和 defineReactive中创建的Dep实例)
  示例：
  vm._data = {
    str:"str"
    obj:{
      name:"xxx"
      sex:"xxx"
    }
  }
  对_data进行响应式处理时，属性为对象和数组，比如处理obj对象（数组同理）
  1.利用闭包，创建的new Dep()实例，这个是隐藏的
  2.obj为对象，继续使用observe方法，创建new Observer()实例，里面也创建了dep实例，挂载到obj.__ob__（就是childOb）
  当访问obj时，触发它的get
  dep.depend()是为闭包的dep收集watcher
  childOb.dep.depend()为obj.__ob__上的dep收集watcher,这个dep收集的watcher是为$set，$delete服务的
  虽然两个dep都收集了同样的watcher，但是vue无法对新添加的属性和数组的修改进行响应式处理，
  Observer中的dep，就是为了能够通过手动调用该dep，来通知watcher更新，间接实现响应式
*/

/**
 响应式处理
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,  //对inject,props,$attrs等数据进行响应式处理时，传递的函数，如果修改了值，会调用该回调函数，因为数据是只读的，所以不应该修改
  shallow?: boolean //shallow为true，表示浅响应式处理，只对对象第一层进行响应式处理
) {
  // 闭包，保存每个数据的dep实例
  // 为每个数据，创建dep实例
  const dep = new Dep();

  // 获取属性的描述符
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    // 如果configurable为false,直接返回
    return;
  }

  // 如果自定义的get和set存在，使用自定义的
  const getter = property && property.get;
  const setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    // 如果setter存在且只传了两个参数，val直接为对象取值
    val = obj[key];
  }

  // 如果该属性是对象或数组，对该属性内的元素处理成响应式，进行递归
  // childOb为返回的观察者实例，就是给当前值绑定的__ob__属性
  let childOb = !shallow && observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // get 拦截对 obj[key] 的读取操作
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val;
      // 依赖收集
      if (Dep.target) {
        dep.depend();
        if (childOb) {
          // 如果childOb存在，给当前值绑定的__ob__属性的dep收集watcher
          childOb.dep.depend();
          if (Array.isArray(value)) {
            // 子属性如果是数组，对数组里的对象进行依赖收集
            dependArray(value);
          }
        }
      }
      return value;
    },
    // 拦截赋值操作
    set: function reactiveSetter(newVal) {
       
      const value = getter ? getter.call(obj) : val;
      // 如果新值和旧值相等或者(newVal和value是NaN)，直接返回，不进行响应式处理
      if (newVal === value || (newVal !== newVal && value !== value)) { 
        return;
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== "production" && customSetter) {
        // 调用传入的customSetter
        customSetter();
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return;
      if (setter) {
        // 如果自定义的setter存在，执行自定义的
        setter.call(obj, newVal);
      } else {
        // 将val赋值成新增，当再次访问时，触发get需要用到val，保证val是最新的
        val = newVal;
      }
      // 将新值进行响应式处理
      childOb = !shallow && observe(newVal);
      // 通知依赖进行更新
      dep.notify();
    },
  });
}

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

/**
  为什么需要dependArray？
  因为observe(obj)方法，传入的obj，对于最外层的是没有进行defineProperty的
  比如vm._data = {
     obj:{
        xxx:"xxx"
     }
     arr[
       {
         obj:{
           "name":"xxx"
          }
       }
     ]
  }
  _data属性本身是没有进行defineProperty处理的，无法收集依赖
  只有内部的属性进行了defineProperty处理，然后会通过get进行依赖收集
  虽然vm._data上也挂载了__ob__属性，但是他的dep并没有收集watcher
  数组里的对象也是同样的道理，最外一层（比如arr里第一个元素）没有办法收集依赖，里面的元素是可以收集依赖的
  dependArray确保了数组里对象的最外一层的__ob__的dep收集了依赖，当对该对象使用Vue.set添加属性时，可以通知watcher进行更新
  如果数组元素里的值是数组或者对象，需要递归去为内部的元素收集相关的依赖
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend(); //为属性添加依赖
    if (Array.isArray(e)) {
      // 如果是数组继续递归
      dependArray(e);
    }
  }
}
