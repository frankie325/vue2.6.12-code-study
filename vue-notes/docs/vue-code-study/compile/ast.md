# 生成的AST对象
经过静态标记后，得到的AST对象，下一步就是根据AST对象，生成渲染函数字符代码
```js
let AST = {
  type: 1, //节点类型
  tag: "tagName", //标签名
  //属性数组
  attrsList: [
    {
      name: "xxx", //属性key（等于号左边的字符）
      value: "xxx", //属性值（等于号右边的字符）
      start: 1, //属性开始索引
      end: 5, //属性结束索引
    },
  ],
  // 只保留属性key和属性值的对象形式
  attrsMap: {
    attrName: attrValue,
  },
  //attrsList转为对象的形式
  rawAttrsMap: {
    attrName: {
      name: "xxx", //属性key
      value: "xxx", //属性值
      start: 1, //属性开始索引
      end: 5, //属性结束索引
    },
  },
  // 属性将作为DOM属性绑定的集合
  props: [
    {
      name: "xxx", //属性key
      value: "xxx", //属性值
      start: 1, //属性开始索引
      end: 5, //属性结束索引
      dynamic: true, //是否是动态属性
    },
  ],
  // 没有绑定动态属性的
  attrs: [
    {
      name: "xxx", //属性key
      value: "xxx", //属性值
      start: 1, //属性开始索引
      end: 5, //属性结束索引
      dynamic: undefined, //没有动态绑定
    },
  ],
  // 绑定动态属性的
  dynamicAttrs: [
    {
      name: "xxx", //属性key
      value: "xxx", //属性值
      start: 1, //属性开始索引
      end: 5, //属性结束索引
      dynamic: true, //动态绑定
    },
  ],
  parent: AST, //当前标签的父标签
  //该标签的子节点
  children: [
    // 普通的注释节点
    {
      type: 3,
      text: "xxx",
      start: 1,
      end: 5,
      isComment: true, //表示为注释节点
    },
    // 普通的文本节点
    {
      type: 3,
      text: "xxx",
      start: 1,
      end: 5,
    },
    // 包含插值表达式的文本节点，以"abc{{ name }}d"为例
    {
      type: 2,
      expression: "'abc'+_s(name)+'d'",
      tokens: [
        "abc",
        {
          "@binding": "_s(name)",
        },
        "d",
      ],
      text: "abc{{ name }}d",
    },
  ],
  ns: "", //命名空间，继承于父级
  start: "", //开始索引
  end: "", //结束索引
  forbidden: true, //非服务端渲染且是模板禁止使用的标签，forbidden为true
  pre: true, //说明标签上存在v-pre指令
  plain: true, //是否是纯标签
  // 解析v-for指令
  res: {
    // 对应的3种情况
    // 1.v-for = "obj in list"
    for: "list",
    alias: "obj",

    // 2.v-for = "(obj, index) in list"
    // for: 'list',
    // alias: 'obj',
    // iterator1: 'index'

    // 3.v-for = "(obj, key, index) in list"
    // for: 'list',
    // alias: 'obj',
    // iterator1: 'key',
    // iterator2: 'index'
  },
  if: "xxx", //v-if属性值
  ifCondition: [
    {
      exp: "xxx", // v-if属性值
      block: AST, // AST对象,自己本身
    },
    {
      exp: "xxx", // v-else-if属性值
      block: AST, // AST对象，v-else-if的标签AST
    },
    {
      exp: undefined, // 说明是v-else
      block: AST, // AST对象，v-else的标签AST
    },
  ],
  else: true, //v-else
  elseif: "xxx", //v-else-if属性值
  once: true, //是否使用了v-once指令
  key: "xxx", //标签上的key属性绑定的值
  ref: "xxx", //标签上的ref属性绑定的值
  refInFor: true, //具有ref属性的标签是否在v-for循环内

  slotName: "xxx", //标签如果是slot标签,会有该属性
  // 这是2.5版本以下的
  slotScope: "xxx", //标签上的slot-scope属性或者scope属性
  slotTarget: "xxx", //标签上的slot属性指定的具名插槽名称，没有为default
  slotTargetDynamic: "xxx", //使用v-bind:slot绑定的插槽名称

  // 这是2.6版本以上的
  slotScope: "xxx", //具名插槽作用域，没有传为"_empty_"
  slotTarget: "xxx", //标签上的v-slot绑定的具名插槽名称，没有为default
  slotTargetDynamic: true, //是否使用v-slot:[slot]动态绑定插槽名称

  // scopedSlots中保存了该标签内所有具有插槽作用域的插槽内容节点
  scopedSlots: {
    // key为组件标签上的指定插槽名
    slotName: {
      type: 1,
      tag: "template",
      attrsList: [],
      parent: el, //父级指向当前组件标签
      slotTarget: "xxx", //插槽名
      slotTargetDynamic: true, //是否动态插槽名
      slotScope: "xxx", //具名插槽作用域，没有传为"_empty_"
      children: [], 
    },
  },
  slotName: "xxx", //slot标签上的属性name
  component: "xxx", //is属性绑定的组件名称
  inlineTemplate: true, //内联模板，组件标签内的子标签不会作为插槽内容，而是作为组件的template渲染，只能有一个根节点
  hasBindings: true, //为true说明标签上使用了v-的指令，包括简写形式
  staticClass: "xxx", //普通属性class的值
  classBinding: "xxx", //使用bind指令绑定的class的值
  //普通属性style的值，经过了parseStyleText处理，普通的style值（color: red; background: green;）变成了对象形式
  staticStyle: JSON.stringify({
    color: "red",
    background: "green",
  }),
  styleBinding: "xxx", //使用bind指令绑定的style的值
  // 使用了.native绑定的事件，内容和下面的事件一样
  nativeEvents: {},
  // 绑定的事件
  events: {
    // 只有一个回调时为对象，多个回调为数组
    // click:{
    //   value:"handleClick1",
    //   dynamic:false,
    //   modifiers: { prevent: true }
    // },
    click: [
      {
        value: "handleClick1", //绑定的事件名称
        dynamic: false, //是否动态事件绑定，如@[event]
        modifiers: { prevent: true }, //修饰符
      },
      {
        value: "handleClick2",
        dynamic: false,
        modifiers: {},
      },
    ],
    // 动态绑定的事件，以绑定的变量作为key属性
    eventName: {
      value: "handleClick",
      dynamic: true,
      modifiers: {},
    },
    // 绑定了.capture修饰符的事件，名称前面添加!
    "!click": {
      value: "handleClick",
      dynamic: false,
      modifiers: {},
    },
    // 绑定了.once修饰符的事件，名称前面添加~
    "~click": {
      value: "handleClick",
      dynamic: false,
      modifiers: {},
    },
    // 绑定了.passive修饰符的事件，名称前面添加&
    "&click": {
      value: "handleClick",
      dynamic: false,
      modifiers: {},
    },
    // 如果是动态绑定事件，且带有.capture、.once、.passive修饰符的，如果同时绑定了这些修饰符会形成嵌套结构，-p( _p( _p(eventName,!) , ~) ,&) 或者 &~!click
    "_p(eventName,!)": {
      //eventName为绑定的变量
      value: "handleClick",
      dynamic: false,
      modifiers: {},
    },
  },
  // v-text、v-html、v-show、v-cloak 、v-model以及用户自定义指令(以v-custom:[arg].xxx.xxx = "method"为例)
  directives: [
    {
      name: "text", //以v-text为例，则name为text
      rawName: "v-custom:[arg].xxx.xxx", //属性key
      value: "method", //属性值
      arg: "arg", //指令绑定的参数
      isDynamicArg: true, //动态属性
      modifiers: {}, //修饰符
    },
    /*
      特殊情况
      v-bind="{id:'xxx',name:'xxx'}",v-on="{ mousedown: doThis, mouseup: doThat }"的对象使用方式
      也会添加进来
    */
    {
      name: "bind",
      rawName: "v-bind",
      value: "{id:'xxx',name:'xxx'}",
      arg: undefined,
      isDynamicArg: false,
      modifiers: {},
    },
  ],
  static: true, //是否为静态节点
  staticInFor: true, //该静态节点或者有v-once指令的节点，是否位于v-for指令标签内
  staticRoot: true, //是否为静态根节点
};

```