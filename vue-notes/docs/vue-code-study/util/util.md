# util目录
**util目录下的工具函数**


## env.js
:::tip 文件目录
/src/core/util/env.js
:::

### nativeWatch  
检查浏览器有没有watch方法，做兼容处理
```js
// 火狐浏览器有Object.prototype.watch方法
export const nativeWatch = ({}).watch
```

### isNative  
判断函数是否是程序自带的
```js
/*
  native code表示是否是程序自带的
  传入的Symbol,Reflect.ownKeys在浏览器输出都为ƒ xxx() { [native code] }
*/
export function isNative (Ctor: any): boolean {
  return typeof Ctor === 'function' && /native code/.test(Ctor.toString())
}

```
### hasSymbol   
判断Symbol，Reflect是否存在
```js 
// 判断Symbol，Reflect是否存在，且Symbol,Reflect.ownKeys是否为程序自带的方法
export const hasSymbol =
  typeof Symbol !== 'undefined' && isNative(Symbol) &&
  typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys)
```

## props.js
:::tip 文件目录
/src/core/util/props.js
:::  

### validateProp   
1. 对Boolean类型做了处理 
2. 父组件没有传prop则获取默认值 
3. 对传入的值进行断言（校验）
```js
/**
 * @description: 得到在propsData中找到的值 1.对Boolean类型做了处理 2.父组件没有传prop则获取默认值 3.对传入的值进行断言（校验）
 * @param {*} key props的key
 * @param {*} propOptions 传入的props
 * @param {*} propsData 父组件传递的prop数据
 * @return {*} 返回value值
 */
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key]
  const absent = !hasOwn(propsData, key) // 父组件传递的propsData是否有这个key
  let value = propsData[key] //在propsData中的值
  // 处理boolean类型的prop
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  if (booleanIndex > -1) {// 大于-1，则说明Boolean类型是在type中是存在的
    /*
    type类型包含Boolean
        传入的三种情况
        1.str,没有在组件上声明，也没有默认值，赋值为false
        2.msg,传入为空字符串，分两种（1）type数组中String在Boolean的前面，则赋值为空字符串，还是传来的值（2）type数组中Boolean在String的前面或只存在Boolean，赋值为true
        3.comp-data，传入的值与key值相等,分两种（1）type数组中String在Boolean的前面，则赋值为"comp-data"，还是传来的值（2）type数组中Boolean在String的前面或只存在Boolean，赋值为true
    这样处理是因为当type有Boolean类型时，prop值没传或者传空字符，将值处理成true，这与js的隐式类型转化类似，但js是将空字符处理成false，vue正好相反
    */
    if (absent && !hasOwn(prop, 'default')) {
      //propsData中没有这个key且该prop没有默认值，则value为false
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // 如果value为空字符或者value与转为连字符的key值相等
      const stringIndex = getTypeIndex(String, prop.type)
      // String不存在或者Boolean在String的前面，布尔类型具有更高的优先级，则仅将空字符串/同名强制转换为true
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  //父组件没有传prop
  if (value === undefined) {
    // 拿到默认值
    value = getPropDefaultValue(vm, prop, key)
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    // 默认值没有进行过响应式处理，需要进行响应式处理
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    // 在开发环境且非 weex 的某种环境下，执行 assertProp 做属性断言
    assertProp(prop, key, value, vm, absent)
  }
  return value
}
```
::: tip 
type包含Boolean类型的示例
:::
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <script src="../dist/vue.js"></script>
  <body>
    <div id="app">
      <comp msg :comp-data="tempData" :ceshi="{}"></comp>
    </div>
  </body>
  <script>
    Vue.component("comp", {
      template: "<div>{{str}},{{msg}},{{compData}}</div>",
      props: {
        str: { type: Boolean }, //1
        msg: { type: [Boolean, String] }, //2
        "comp-data": { type: [Array, Boolean, String] }, //3
      },
      mounted() {
        console.log(this.str, this.msg, this.compData); //输出false,true,true
      },
    });
    new Vue({
      el: "#app",
      data: () => {
        return {
          tempData: "comp-data",
        };
      },
    });
  </script>
</html>
```

### getPropDefaultValue  
获取prop的默认值

:::warning 注意
prop的default类型为Object或者Array，需为一个函数
:::

```js
/**
返回prop的默认值
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // 默认值也没有，返回undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    // default的类型为Object或者Array，需为一个函数，返回默认值
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
    ) {
    // 因为父组件没有传值，使用的是默认值（不需要进行数据更新），所以判断vm._props[key]存在吗，存在使用上一次的值，避免触发不必要的watcher更新
    return vm._props[key]
  }
  
  // 为方法且类型不是Function，执行call
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}
```

### assertProp
校验prop值是否正确
```js
/**
对传入的prop值进行断言
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 有required属性，且父组件没传，报警告，返回
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  // value为null且不是必填，直接返回
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || type === true //？？搞不懂干啥用的
  // 接收到的类型数组
  const expectedTypes = []
  if (type) {
    if (!Array.isArray(type)) {
      // type不是数组形式，转为数组
      type = [type]
    }
    for (let i = 0; i < type.length && !valid; i++) {
      // 遍历数组，如果valid为true时会结束循环
      const assertedType = assertType(value, type[i], vm)
      // 所有期待的类型集合，type如果乱传，得到的会是["","",""]这样的数组
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  // expectedTypes中存在正确的类型,如["","","String"]，则haveExpectedTypes为true
  const haveExpectedTypes = expectedTypes.some(t => t)
  if (!valid && haveExpectedTypes) {
    // 如果走到这里，说明传的值和期待的值不一样，没有找到配对的类型，报类型匹配错误信息
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  // 执行用户自定义的校验
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      // 自定义校验不通过，报警告
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}
```
### assertType  
prop的值与prop的type类型进行校验
```js
const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol|BigInt)$/
/**
 * @description: 对传入的值与type进行校验
 * @param {*} value 传入的需要校验的值
 * @param {*} type 传入的内置类型
 * @param {*} vm
 * @return {*} 返回一个对象{
    valid, //是否通过校验
    expectedType // 类型字符串
  }
 */
function assertType (value: any, type: Function, vm: ?Component): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type) //拿到内置类型的字符串
  if (simpleCheckRE.test(expectedType)) {//符合上面的正则表达式
    const t = typeof value //typeof有四种情况会是"object",1.typeof [] 2.typeof {} 3. typeof null 4.typeof new String("xx")...
    valid = t === expectedType.toLowerCase() //typeof value 与 expectedType转小写后比较
    // 比较后，valid如果为false，还需进一步判断，因为t有上述的4种情况
    if (!valid && t === 'object') {
      // 判断value是不是type的实例
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    // 是不是对象
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    // 是不是数组
    valid = Array.isArray(value)
  } else {
    try {
      valid = value instanceof type
    } catch (e) {
      // 传入错误的type类型,比如type:"xxx", type:{} 
      warn('Invalid prop type: "' + String(type) + '" is not a constructor', vm);
      valid = false;
    }
  }
  return {
    valid,
    expectedType
  }
}
```
### getTypeIndex   
返回指定内置对象，在type类型数组中的索引，没有返回-1

```js
const functionTypeCheckRE = /^\s*function (\w+)/
/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 *  使用函数字符串名称检查内置类型，因为简单的相等性检查在运行时会失败跨不同的vm/iframe
 * 例如Boolean.toString().match(/^\s*function (\w+)/)会返回
 * ["function Boolean", "Boolean"]
 */
function getType (fn) {
  const match = fn && fn.toString().match(functionTypeCheckRE)
  return match ? match[1] : ''
}

// 用来判断内置对象String,Boolean等是否相等
function isSameType (a, b) {
  return getType(a) === getType(b)
}

  /**
   * @description: 判断指定的内置对象是否存在，有则返回指定的索引，没有返回-1
   * @param {*} type 指定的用来比较的内置对象
   * @param {*} expectedTypes 传来的prop的type 1.为String等... 2.为[String,xxx]数组形式
   * @return {*} 返回一个数字
   */ 
function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    // expectedTypes不是数组，存在则返回0，不存在返回-1
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    // expectedTypes为数组，返回指定内置对象在expectedTypes的索引
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}
```

### getInvalidTypeMessage
根据传入的prop值，以及type类型选择不同的报错方式

```js
// 根据传入的prop值，以及type类型选择不同的报错方式
function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0] //期望接收类型数组的第一个元素
  const receivedType = toRawType(value) //传入的值类型
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    isExplicable(typeof value) &&
    !isBoolean(expectedType, receivedType)
  ) {
    // 如果expectedTypes长度为1，比如type:String,接收的value是个数字，就满足上面条件，报错信息会显示具体的信息
    //  [Vue warn]: Invalid prop: type check failed for prop "msg". Expected String with value "12", got Number with value 12.
    message += ` with value ${styleValue(value, expectedType)}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${styleValue(value, receivedType)}.`
  }
  return message
}

function styleValue (value, type) {
  // 当type为String或Number时，将值转化为指定形式去显示
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

const EXPLICABLE_TYPES = ['string', 'number', 'boolean']
// 检查value是否存在与上列数组中，用来判断在报错信息是否显示具体的值
function isExplicable (value) {
  return EXPLICABLE_TYPES.some(elem => value.toLowerCase() === elem)
}

// 检查args数组中是否有等于“boolean”的
function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
````