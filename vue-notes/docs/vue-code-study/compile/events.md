# v-on事件绑定的原理 
:::tip 文件目录
/src/compiler/codegen/events.js
:::

## 用到的正则

### fnExpRE
```js
/*
^([\w$_]+|\([^)]*?\))  分组捕获
  [\w$_]+     匹配数字字母下划线或者$符或者下划线1次或多次
  |\([^)]*?\) 或者匹配 ( 非右括号的所有字符重复任意次，但尽可能少的重复 )  
  \s*=>  匹配空白符0次或多次和=>箭头符号
  这里就是匹配ES6的箭头函数   (arg1,arg2) => {} 到箭头部分

  |^function(?:\s+[\w$]+)?\s*\(  与上面整个的或
    匹配function开头 （和空白1次或多次  和数字字母下划线或者$符1次或多次）整体0次或1次 和空白1次或多次和左括号
  这里就是匹配function xxx(    函数声明部分，可以不命名就是 function (

  所以该正则就是匹配事件绑定时，函数的写法
*/
const fnExpRE = /^([\w$_]+|\([^)]*?\))\s*=>|^function(?:\s+[\w$]+)?\s*\(/
```
### fnInvokeRE
```js
/*
  匹配 ( 非右括号的所有字符重复任意次，但尽可能少的重复 ) 和 ;0次或多次 结尾
  因为事件绑定中可以直接调用传入自己的参数，比如@click="obj['fun'](arg1,arg2);"

  该正则就是匹配圆括号到结尾的部分
*/
const fnInvokeRE = /\([^)]*?\);*$/
```
### simplePathRE
```js
/*
^[A-Za-z_$] 开头匹配字母或者下划线或者$
[\w$]*  匹配字母数字下划线或者$符0次或多次

(?:xxxxxx)  剩下的内容分组但不捕获
\.[A-Za-z_$][\w$]* 匹配点符号和 字母或者下划线或者$ 和 字母数字下划线或者$符0次或多次。就是匹配obj.name的取值方式
|\['[^']*?'] 或者匹配['非单引号字符0次或多次']  就是匹配方括号内的字符，如obj['name']取值方式
|\["[^"]*?"] 或者匹配["非双引号字符0次或多次"]
|\[\d+] 或者匹配[数字1次或多次]  就是匹配数组的取值方式
|\[[A-Za-z_$][\w$]*]  或者 [ 字母开头或者下划线或者$和匹配字母数字下划线或者$符0次或多次 ] 就是匹配取值时里面又包含了其他变量

因为绑定事件时可以是data中的变量，@click="obj['obj2'].fun"，支持简单的一些取值路径，不能匹配嵌套的取值，比如obj[obj2['key']]
所以该正则就是匹配变量的简单取值路径
*/ 
const simplePathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/
```

## genHandlers
```js
// 生成el.events中所有事件的字符代码
export function genHandlers (
  events: ASTElementHandlers,
  isNative: boolean
): string {
  // 字符前缀，nativeOn:表示原生事件， on:表示普通事件
  const prefix = isNative ? 'nativeOn:' : 'on:'
  let staticHandlers = ``
  let dynamicHandlers = ``
  for (const name in events) {
    // 遍历events属性，调用genHandler传入事件内容
    const handlerCode = genHandler(events[name])
    if (events[name] && events[name].dynamic) {
      // 如果是动态绑定的事件
      // 生成字符 "eventName1, function($event){...}, eventName2, [function($event){...}, function($event){...}]...,"
      dynamicHandlers += `${name},${handlerCode},`
    } else {
      // 普通的事件绑定
      // 生成字符 "'click':function($event){...},'keydown':[function($event){...}, function($event){...}],...,"
      staticHandlers += `"${name}":${handlerCode},`
    }
  }
  // 去掉最后的逗号，用{}包裹
  staticHandlers = `{${staticHandlers.slice(0, -1)}}`
  if (dynamicHandlers) {
    // 如果存在动态绑定 返回"on: _d({'click':function($event){...},...},[eventName1, function($event){...},...])"
    return prefix + `_d(${staticHandlers},[${dynamicHandlers.slice(0, -1)}])`
  } else {
    // 没有动态绑定 返回"on:{'click':function($event){...},...}"
    return prefix + staticHandlers
  }
}
```
## genHandler
处理events属性中的事件内容（微信平台的这里不做介绍）  

### 没有修饰符时的处理
事件的绑定方式有多种写法
- 简单的变量路径 ```@click="handleClick"、@click="obj['fun']"```      
  直接返回绑定的变量字符
- 变量路径调用的写法 ```@click="handleClick(arg, $event)"、@click="obj['fun']($event)"```  
  包裹一层函数 ```function($event){ return handleClick(arg, $event) }```
- 直接绑定一个函数的写法 ```@click="function (){ ... }"、@click="()=>{ ... }"```  
  直接返回绑定的函数
- js语句的写法 ```@click=" show = true; "```
  包裹一层函数```function($event){ show = true; }```
```js
// 生成一个函数字符
function genHandler (handler: ASTElementHandler | Array<ASTElementHandler>): string {
  if (!handler) {
    // 不存在返回一个空的函数字符
    return 'function(){}'
  }

  if (Array.isArray(handler)) {
    // 如果是数组，遍历每一项调用genHandler
    return `[${handler.map(handler => genHandler(handler)).join(',')}]`
  }

  // 绑定的值如果是简单的取值路径，为true
  const isMethodPath = simplePathRE.test(handler.value)
  // 绑定的值如果是函数的写法，为true
  const isFunctionExpression = fnExpRE.test(handler.value)
  // 先剔除掉函数调用的部分，剩下字符的如果是简单的取值路径，为true，说明绑定的值是函数调用的方式
  const isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, ''))

  if (!handler.modifiers) {
    // 如果没有修饰符

    if (isMethodPath || isFunctionExpression) {
      // 如果是简单的取值路径或者函数的写法，直接返回
      return handler.value
    }
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      // 如果是WEEX平台，为WEEX生成处理代码
      return genWeexHandler(handler.params, handler.value)
    }

    /*
      如果走到这说明是函数调用的写法或者其它的写法
      返回一个函数字符
      函数调用写法  @click="handleClick(arg)"
      "function($event){ return handleClick(arg) }"
      其它写法 比如直接在绑定事件里进行操作 @click=" show = true; "
      "function($event){ show = true; }"
    */ 
    return `function($event){${
      isFunctionInvocation ? `return ${handler.value}` : handler.value
    }}` // inline statement
```
### 有修饰符的处理
else条件处理有修饰符的事件绑定
```js
  } else {
    // 存在修饰符
    let code = ''
    let genModifierCode = '' //modifierCode中生成的代码字符会合并到这来
    const keys = []  //保存键盘事件的修饰符
    // 遍历修饰符对象
    for (const key in handler.modifiers) {
      if (modifierCode[key]) {
        // 如果存在于modifierCode中
        // 拼接修饰符对应的操作语句
        // 如 "$event.stopPropagation();if($event.target !== $event.currentTarget)return null;"
        genModifierCode += modifierCode[key]
        // left/right
        // 即键盘事件上的left和right修饰符，这个时候就表示方向键左键和方向右键了，要添加到keys数组中
        if (keyCodes[key]) {
          keys.push(key)
        }
      } else if (key === 'exact') {
        // 如果是exact修饰符

        // 以@keydown.ctrl.a.exact为例
        // 拿到所有修饰符
        const modifiers: ASTModifiers = (handler.modifiers: any)
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            // 上面4个，不存在于修饰符中的筛选出来 ['shift', 'alt', 'meta']
            .filter(keyModifier => !modifiers[keyModifier])
            .map(keyModifier => `$event.${keyModifier}Key`)
            .join('||')
            )
        // 生成的代码字符为 if(!$event.ctrlKey)return null;if($event.shiftKey || $event.altKey || $event.metaKey)return null;
        // 可以看出如果按住ctrl键，再按住其他系统组合键，就不会往下执行了
        // 所以.exact修饰符就是精确控制系统组合键的触发
      } else {
        // 走到这说明说明上面的的条件都不满足，只能为键盘修饰符了，推入到keys中
        keys.push(key)
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys) //拼接代码字符
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    // 确保在键过滤后执行诸如 prevent 和 stop 之类的修饰符
    if (genModifierCode) {
      code += genModifierCode //拼接代码字符
    }

    // 根据绑定的值的写法，生成不同的字符代码
    const handlerCode = isMethodPath
      ? `return ${handler.value}.apply(null, arguments)`
      : isFunctionExpression
        ? `return (${handler.value}).apply(null, arguments)`
        : isFunctionInvocation
          ? `return ${handler.value}`
          : handler.value

    /* istanbul ignore if */
    // WEEX平台的处理
    if (__WEEX__ && handler.params) {
      return genWeexHandler(handler.params, code + handlerCode)
    }

    /*
      绑定的值如果是简单的取值路径  @click="obj['func']"
      function($event){
        //键盘修饰符生成的代码 
        if(!$event.type.indexOf('key')&&
        $event.keyCode!== 65  
        && _k('$event.keyCode',修饰符的名字,keyCode,'$event.key',keyName)
        &&...
        ) return null;
        
        // modifierCode中的修饰符生成的代码
        $event.stopPropagation();if($event.target !== $event.currentTarget)return null;

        return obj['func'].apply(null, arguments)
      }

      绑定的值如果是函数写法   @click="()=>{ ... }"
      function($event){
        //键盘修饰符生成的代码 
        ...
        // modifierCode中的修饰符生成的代码
        ...
        return (()=>{ ... }).apply(null, arguments)
      }

      绑定的值如果是函数调用写法   @click="handleClick(arg, $event);"
      function($event){
        //键盘修饰符生成的代码 
        ...
        // modifierCode中的修饰符生成的代码
        ...
        return handleClick(arg, $event);
      }

      绑定的值如果是其他写法   @click=" show = true; "
      function($event){
        //键盘修饰符生成的代码 
        ...
        // modifierCode中的修饰符生成的代码
        ...
        show = true;
      }
    */
    return `function($event){${code}${handlerCode}}`
  }
}
```

### modifierCode
拼接修饰符对应的操作语句  
创建一个if语句，通过判断事件源$event的属性，来决定代码是否继续往下执行，除了modifierCode内的修饰符以及exact修饰符，剩下的键盘修饰符由genKeyFilter处理
```js
/*
以.shift为例，要按了shift件事件才会触发，添加if(!$event.shiftKey)判断字符，
如果$event.shiftKey为false，说明没有按住shift按键，直接返回，不往下执行
*/ 
const genGuard = condition => `if(${condition})return null;`

const modifierCode: { [key: string]: string } = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard(`$event.target !== $event.currentTarget`),
  ctrl: genGuard(`!$event.ctrlKey`),   //通过事件源中的ctrlKey属性，判断是否按住了。为什么不用keyCode判断，因为ctrl键是组合键，没有keyCode属性
  shift: genGuard(`!$event.shiftKey`), //组合键有4个，ctrl，shift，alt，meta
  alt: genGuard(`!$event.altKey`),
  meta: genGuard(`!$event.metaKey`),
  left: genGuard(`'button' in $event && $event.button !== 0`),  //鼠标点击事件才会存在button属性，左键button为0
  middle: genGuard(`'button' in $event && $event.button !== 1`), //中键button为1
  right: genGuard(`'button' in $event && $event.button !== 2`)   //右键button为2
}
```
### genKeyFilter
生成键盘修饰符对应的代码
```js
// 生成keys中所有修饰符对应的代码
function genKeyFilter (keys: Array<string>): string {
  return (
    // make sure the key filters only apply to KeyboardEvents
    // #9441: can't use 'keyCode' in $event because Chrome autofill fires fake
    // key events that do not have keyCode property...
    /*
        !$event.type.indexOf('key')
        type为事件类型，只有键盘事件keyup，keydown等会包含key字符，则返回0，!0为true
        也就是说只有是键盘事件才会继续执行剩余的条件判断

        返回一个if语句字符
        if(!$event.type.indexOf('key')&&
        $event.keyCode!== 65  
        && _k('$event.keyCode',修饰符的名字,keyCode,'$event.key',keyName)
        &&...
        ) return null;

        以@keydown.a.b.c为例   只要按下a,b,c其中一个键，返回false，就不会终止执行。按下其他键，条件成立，终止执行。

    */
    `if(!$event.type.indexOf('key')&&` + 
    `${keys.map(genFilterCode).join('&&')})return null;`
  )
}
```
### genFilterCode
```js
// KeyboardEvent.keyCode aliases
// 键盘事件中，一些特殊的按键对应的keyCode
const keyCodes: { [key: string]: number | Array<number> } = {
  esc: 27,
  tab: 9,
  enter: 13,
  space: 32,
  up: 38,
  left: 37,  //这个left是方向键 <-
  right: 39, 
  down: 40,
  'delete': [8, 46]
}

// KeyboardEvent.key aliases
// 键盘事件中，一些特殊的按键对应的keyName
const keyNames: { [key: string]: string | Array<string> } = {
  // #7880: IE11 and Edge use `Esc` for Escape key name.
  esc: ['Esc', 'Escape'],
  tab: 'Tab',
  enter: 'Enter',
  // #9112: IE11 uses `Spacebar` for Space key name.
  space: [' ', 'Spacebar'],
  // #7806: IE11 uses key names without `Arrow` prefix for arrow keys.
  up: ['Up', 'ArrowUp'],
  left: ['Left', 'ArrowLeft'],
  right: ['Right', 'ArrowRight'],
  down: ['Down', 'ArrowDown'],
  // #9112: IE11 uses `Del` for Delete key name.
  'delete': ['Backspace', 'Delete', 'Del']
}

/*
生成修饰符对应的代码
keys数组中的修饰符 [65, 66, c, d, ...]
可以是数字，可以是按键名称，或者自定义的keyCodes 通过Vue.config.keyCodes定义
*/ 
function genFilterCode (key: string): string {
  // parseInt处理修饰符，如果存在说明该修饰符为数字，字符形式的修饰符会返回NaN
  const keyVal = parseInt(key, 10) //
  if (keyVal) {
    // 如果是数字，直接返回生成对应的语句
    return `$event.keyCode!==${keyVal}`
  }

  const keyCode = keyCodes[key] //获取修饰符的keyCode，如果没有就是undefined
  const keyName = keyNames[key] //获取修饰符的keyName

  //如果是字符 返回"_k('$event.keyCode',修饰符的名字,keyCode,'$event.key',keyName)"
  return (
    `_k($event.keyCode,` +
    `${JSON.stringify(key)},` +
    `${JSON.stringify(keyCode)},` +
    `$event.key,` +
    `${JSON.stringify(keyName)}` +
    `)`
  )
}
```
**有修饰符的事件绑定生成的字符代码**  
- 简单的变量路径 ```@click="handleClick"、@click="obj['fun']"```      
  ```js
    function($event){
        //键盘修饰符生成的代码 
        if(!$event.type.indexOf('key')&&
        $event.keyCode!== 65  
        && _k('$event.keyCode',修饰符的名字,keyCode,'$event.key',keyName)
        &&/*...*/
        ) return null;
        
        // modifierCode中的修饰符生成的代码
        $event.stopPropagation();if($event.target !== $event.currentTarget)return null;

        return obj['func'].apply(null, arguments)
    }
  ```
- 变量路径调用的写法 ```@click="handleClick(arg, $event)"、@click="obj['fun']($event)"```  
  ```js
    function($event){
        //键盘修饰符生成的代码 
        /*...*/
        // modifierCode中的修饰符生成的代码
        /*...*/
        return handleClick(arg, $event);
    }
  ```
- 直接绑定一个函数的写法 ```@click="function (){ ... }"、@click="()=>{ ... }"```  
  ```js
    function($event){
        //键盘修饰符生成的代码 
        /*...*/
        // modifierCode中的修饰符生成的代码
        /*...*/
        return (()=>{ ... }).apply(null, arguments)
    }
  ```
- js语句的写法 ```@click=" show = true; "```
  ```js
    function($event){
        //键盘修饰符生成的代码 
        /*...*/
        // modifierCode中的修饰符生成的代码
        /*...*/
        show = true;
    }
  ```