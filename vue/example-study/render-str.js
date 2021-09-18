// 一个子节点时
render = _c("tagName", data, _c(tag, data, children, normalizationType), 1);
//多个子节点
render = _c(
  "tagName", 
  {
    // 还需要运行时处理的指令，只有v-model
    directives: [
      {
        name: "name",
        rawName: "rawName",
        value: "(value)",
        expression: JSON.stringify(value),
        arg: "arg", //如果是动态属性，会在包一层双引号"'arg'"
        modifiers: JSON.stringify(modifiers),
      },
    ],
    key: "xxx", //key属性值
    ref: "xxx", //ref属性值
    refInFor: true, //具有ref属性的标签是否在v-for循环内
    pre: true, //说明标签上存在v-pre指令
    tag: "component", //是动态组件的话记录原始名称
    staticClass: "xxx", //普通属性class的值
    class: "xxx", //使用bind指令绑定的class的值
    //普通属性style的值，经过了parseStyleText处理
    staticStyle: JSON.stringify({
      color: "red",
      background: "green",
    }),
    style: "xxx", //使用bind指令绑定的style的值
    // 作为标签上的属性
    // _d()第一个参数为静态属性生成的字符串，第二个参数为动态属性生成的字符串，如果没有动态属性那么attrs : "{"attrName1":attrValue1,"attrName2":attrValue2,...}"
    attrs:
      '_d({"attrName1":attrValue1,"attrName2":attrValue2,...},[attrName1,attrValue1,attrName2,attrValue2,...])',
    // 作为DOM属性，值同上
    domProps:
      '_d({"attrName1":attrValue1,"attrName2":attrValue2,...},[attrName1,attrValue1,attrName2,attrValue2,...])',
    // vue中事件，第一个参数为静态绑定生成的的字符串，第二个参数为动态绑定事件生成的字符串，如果没有动态绑定事件 on : "{'click':function($event){...},...}"
    on: "_d({'click':function($event){...},...},[eventName1, function($event){...},...])",
    // 使用.native修饰符绑定的事件，同上
    nativeOn:
      "_d({'click':function($event){...},...},[eventName1, function($event){...},...])",
    // 没有使用作用域插槽的标签，只使用了slot属性
    slot: "slotTarget",
    /*
        作用域插槽，以下面为例
        <comp>
        <template v-slot:center="{msg}" v-if="showCenter">
            <div>{{msg}}</div>
        </template>
        <comp>
    */
    scopedSlots: _u(
      [
        // 使用了v-if，会包一层三目运算符
        showCenter
          ? {
              key: center,
              fn: function ({ msg }) {
                return showCenter
                  ? _c("div", data, children, normalizationType)
                  : undefined;
              },
            }
          : null,
        //   没使用v-if
        {
          key: center,
          fn: function ({ msg }) {
            return showCenter
              ? _c("div", data, children, normalizationType)
              : undefined;
          },
          proxy: true, //表示只使用了v-slot但是没有绑定作用域
        },
        /*...*/
      ],
      null, 
      true
    ),//或者 null,false,hash值
    // 组件上的v-model，以<compName v-model.trim.number="test['test1'][test2]">为例
    model: {
      value: "(test['test1'][test2])",
      expression: JSON.stringify(test["test1"][test2]),
      callback: `callback ($$v){ 
                        $set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))
                    }`,
    },
    // 内联模板，会调用generate，将生成的字符包裹上一层function
    inlineTemplate: {
      render: function () {
        with (this) {
          return _c(tag, data, children, normalizationType);
        }
      },
      staticRenderFns: [
        function () {
          with (this) {
            return _c(tag, data, children, normalizationType);
          }
        },
        /*...*/
      ],
    },
  },
  // 数组中为所有子节点，如果是内联模板，该项为null
  [
    _c(tag, data, children, normalizationType),
    // 动态组件，componentName为is属性的值
    _c(componentName, data, children),
    // 静态根节点
    // 第一个参数表示，该节点渲染函数在staticRenderFns数组中的索引
    // 第二个参数表示是否在v-for指令内
    _m(index, true),
    // 只使用了v-once的标签，没有第二个参数
    _m(index),
    // 使用了v-once的标签且使用了v-if的标签，比如<div v-once v-if="show"></div>
    show ? _m(index) : _e(),
    // 使用了v-once的标签在v-for循环内，key属性为v-for标签绑定的key
    _o(_c(tag, data, children, normalizationType), onceId, key),

    // 使用了v-for指令的标签 比如 v-for = "(obj, key, index) in list"
    _l(list, function (obj, key, index) {
      // 因为包裹了一层函数，所以v-for内的子节点可以访问到循环的数据
      return _c(tag, data, children, normalizationType);
    }),
    /*
      <h1 v-if="show1">...</h1>
      <h2 v-else-if="show2">...</h2>
      <h3 v-else>...</h3>
      使用了v-if，v-else-if，v-else的标签
      就是根据三元运算去调用渲染函数，如果有多个v-else-if，就是多个三元进行嵌套
    */
    show1
      ? _c("h1", data, children, normalizationType)
      : show2
      ? _c("h2", data, children, normalizationType)
      : _c("h3", data, children, normalizationType),

    /*
        slot标签
        第一个参数为slot标签的name属性
        第二个参数为slot标签内的子标签，没有子标签为null
        第三个参数为slot标签上的属性（不包括name属性，因为已经从el.attrs剔除了），经过了genProp处理，没有属性则为null
        第四个参数v-bind绑定的对象形式值，没有这样绑定就没有第四个参数
    */
    _t(
      slotName,
      function () {
        return [_c(tag, data, children, normalizationType)];
      },
      _d(/*...*/),
      { key: value /*...*/ }
    ),
    // 文本节点，以"abc{{ name }}d"为例
    _v(abc + _s(name) + d),
    // 注释节点
    _e("注释文本内容"),
  ],
  1 //规范化类型
);

// 如果存在动态属性，使用_b()包裹生成的data字符
render = _c(
  "tagName",
  _b(data, tagName, "genProps生成的字符"),
  _c(tag, data, children, normalizationType),
  1
);

// 如果使用了v-bind="{ id: 'id', name: 'name' }"对象形式，使用_b()包裹生成的data字符
render = _c(
  "tagName",
  //第四个参数表示是否有.prop修饰符
  //第五个参数为true表示有.sync修饰符，没有.sync修饰符的话，就没有第五个参数
  _b(data, "tagName", { id: "id", name: "name" }, true, true),
  _c(tag, data, children, normalizationType),
  1
);

// 如果事件绑定时，使用了v-on="{ click:handleClick }"对象形式时，使用_g()包裹生成的data字符
render = _c(
  "tagName",
  _g(data, { click: handleClick }),
  _c(tag, data, children, normalizationType),
  1
);

// 根节点是静态根节点
code = {
  render: "with(this){return _m(0,true)}",
  staticRenderFns: ["with(this){return _c(...)"],
};

// 根节点使用了v-once
code = {
  render: "with(this){return _m(0,true)}",
  staticRenderFns: ["with(this){return _c(...)"],
};

// 根节点使用了v-if，v-else-if
code = {
  render: "with(this){return show ? _c(...) : _c(...) ) }",
  staticRenderFns: [
    /*...*/
  ],
};
