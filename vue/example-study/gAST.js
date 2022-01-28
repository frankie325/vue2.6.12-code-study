let AST = {
  // 属性将作为DOM属性绑定的集合
  props: [
    {
      //v-html指令
      name: "innerHTML", //属性key
      value: "_s(xxx)", //_s()包裹属性值
      dynamic: undefined,
    },
    {
      //v-text指令
      name: "textContent", //属性key
      value: "_s(xxx)", //_s()包裹属性值
      dynamic: undefined,
    },
    /*
    <input value="name" true-value="yes" false-value="no" type="checkbox" v-model.number="test['test1'][test2]">
    处理复选框的v-model时，添加checked到props，value为
    `Array.isArray(test['test1'][test2])?
     _i(test['test1'][test2],name)>-1 : _q(test['test1'][test2],yes)
    `
    生成一个三目表达式，作用是复选框标签初始化时，复选框是否勾选需要根据v-model绑定的变量进行判断
    可以猜出：_i()和_q()的作用
    _i()：如果绑定的变量是数组，该变量内是否包含value属性值，如果是则勾选上
    _q()：如果绑定的变量不是数组，该变量的值是否等于true-value的值，如果是则勾选上
    _i()和_q()的具体代码后面再说
    */
    {
      name: "checked",
      value: `Array.isArray(test['test1'][test2])?
              _i(test['test1'][test2],name)>-1 : _q(test['test1'][test2],yes)
            `,
      dynamic: undefined,
    },
    /*
      处理单选框的v-model时，添加checked到props，value为_q(test['test1'][test2], name1)
      比较简单，只需要判断绑定的变量值与哪个标签的value值相等就行了
      <input name="name" value="name1" id="radio"  type="radio" v-model="test['test1'][test2]">
      <input name="name" value="name2" id="radio"  type="radio" v-model="test['test1'][test2]">
      <input name="name" value="name3" id="radio"  type="radio" v-model="test['test1'][test2]">
      以上面第一个标签为例
    */
    {
      name: "checked",
      value: "_q(test['test1'][test2], name1)", //用来判断绑定的变量值与哪个标签value属性相等
      dynamic: undefined,
    },
    /*
      如果是其他类型的input标签和textarea标签，处理v-model时，添加value到props
      以下面的输入框为例
      <input type="text" v-model="test['test1'][test2]">
      value为"(test['test1'][test2])"
    */

    {
      name: "value",
      value: "(test['test1'][test2])",
      dynamic: undefined,
    },
  ],
  // 没有绑定动态属性的
  attrs: [],
  // 绑定动态属性的
  dynamicAttrs: [],
  parent, //当前标签的父标签
  //该标签的子节点
  children: [],
  // 组件上使用了native修饰符的事件
  nativeEvents: {},
  // 绑定的事件
  events: {
    /*
        <select name="select" v-model="test['test1'][test2]" >
            <option value="value1"></option>
            ...
        </select>

        select标签上的v-model处理，添加change事件到events，value为下面的可执行字符串
        var $$selectedVal = Array.prototype.filter
                .call($event.target.options,function(o){return o.selected}) // 筛选出选中的option标签
                .map(function(o){
                   var val = "_value" in o ? o._value : o.value;  // 获取option标签的value属性，三目运算是为了兼容不同平台
                   return 'val' // 如果存在number修饰符，通过_n()包裹属性值
                 };
        //上面代码的意思是获取选择器选中的值，保存在数组中  
             
        //为绑定的变量赋值，如果是多选就取整个数组的值，单选就取数组内第一个元素
        $set(test['test1'] ,[test2], '$event.target.multiple ? $$selectedVal : $$selectedVal[0]')
    */
    change: {
      value: `
                var $$selectedVal = Array.prototype.filter
                .call($event.target.options,function(o){return o.selected})
                .map(function(o){
                   var val = "_value" in o ? o._value : o.value;
                   return 'val'
                 };
                $set(test['test1'] ,[test2], '$event.target.multiple ? $$selectedVal : $$selectedVal[0]')
            `,
      dynamic: false,
      modifiers: {},
    },
    /*
    复选框的v-model处理，添加change事件
    我们知道复选框会根据v-model绑定的变量的类型来做出不同的响应
    如果该变量是数组，那么复选框的选中与不选中是往数组添加和删除value属性值
    如果该变量是其他类型，那么复选框的选中与不选中是为该变量赋予真值和假值（真值和假值可以用户自定义，即true-value和false-value的值）
    就是通过下面的代码实现的
   `var $$a=test['test1'][test2],  //v-model绑定的变量字符
    $$el=$event.target,   //事件源
    $$c=$$el.checked?(yes):(no);   //$$c为true-value或者false-value的值
    if(Array.isArray($$a)){    //绑定的变量，如果是数组
      var $$v= _n(name),    //存在.number修饰符，用_n()包裹value属性值
      $$i=_i($$a,$$v);  //_i()的作用是判断value属性值是否存在于绑定的变量中
      if($$el.checked){  //复选框选中
        // $$i<0 已经存在的话，不会进行合并
        $$i<0 && $set(test['test1'] ,[test2], $$a.concat([$$v]) )  // 将value属性值合并到该数组
      }else{  //复选框取消选中
        // $$i>-1 已经不存在的话，不会进行剔除
        $$i>-1 && $set(test['test1'] ,[test2], $$a.slice(0,$$i).concat($$a.slice($$i+1)) )  // 将value属性值从该数组剔除
      }
    }else{ //绑定的变量，如果不是数组
      $set(test['test1'] ,[test2], $$c )  //该绑定变量赋值为true-value或者false-value的值
    }
    `
  */
    change: {
      value: `  
                var $$a=test['test1'][test2], 
                $$el=$event.target, 
                $$c=$$el.checked?(yes):(no);  
                if(Array.isArray($$a)){   
                  var $$v= _n(name),   
                  $$i=_i($$a,$$v);
                  if($$el.checked){  
                    $$i<0 && $set(test['test1'] ,[test2], $$a.concat([$$v]) ) 
                  }else{  
                    $$i>-1 && $set(test['test1'] ,[test2], $$a.slice(0,$$i).concat($$a.slice($$i+1)) ) 
                  }
                }else{ 
                  $set(test['test1'] ,[test2], $$c )  
                }
            `,
      dynamic: false,
      modifiers: {},
    },
    // 如果是单选框，添加change事件
    change: {
      value: "$set(test['test1'] ,[test2], name1)",
      dynamic: false,
      modifiers: {},
    },
    /*
        如果是其他类型的input标签和textarea标签的v-model处理
        一般是添加input事件，如果有lazy修饰符，添加的是change事件
    */
    input: {
      value: "$set(test['test1'] ,[test2], $event.target.value)",
      dynamic: false,
      modifiers: {},
    },
    // 如果输入框上存在trim或者number修饰符，添加blur事件，调用的方法为$forceUpdate()，暂时还不知道作用
    blur: {
      value: "$forceUpdate()",
      dynamic: false,
      modifiers: {},
    },
  },
  /*
    如果是组件上的v-model，添加model对象到AST中
    以<compName v-model.trim.number="test['test1'][test2]">为例
    {
      value: "(test['test1'][test2])", 
      expression: JSON.stringify(test['test1'][test2]),
      callback: callback ($$v){ 
         $set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))
      }
    }
  */
  model: {
    value: "(test['test1'][test2])",
    expression: JSON.stringify(test["test1"][test2]),
    callback: `callback ($$v){ 
                    $set(test['test1'] ,[test2], _n(typeof $$v === 'string' ? $$v.trim() : $$v))
                }`,
  },
  // 当标签上使用 v-bind="{ id:xxx , name:xxx }"对象形式时，添加wrapData属性
  // 在genData的时候调用该方法，传入的参数code为genData生成的对象字符
  wrapData: (code: string) => {
    //  第四个参数表示是否有.prop修饰符，第五个参数为true表示有.sync修饰符，没有.sync修饰符的话，就没有第五个参数
    return `_b(${code},'tagName',{ id:xxx , name:xxx } ,true ,true)`;
  },
  // 当标签上使用 v-on="{ click:handleClick }"对象形式时，添加wrapListeners属性
  // 在genData的时候调用该方法，传入的参数code为genData生成的对象字符
  wrapListeners: (code) => `_g(${code} ,{ click:handleClick })`,
};
