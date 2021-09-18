# 编译器解析
## 解析大致过程
:::tip 文件目录
/src/compiler/parser/index.js
:::

parse函数内部调用了parseHTML，parseHTML的作用就是解析HTML字符串，也就是词法分析。parse的作用则是根据词法分析去生成一个AST树，下面是构建AST树的关键代码。

```js
parseHTML(html,options){
   // 存储匹配的开始标签
   const stack = []
   while(html){
      /*...*/ 
      // 如果是开始标签，调用
      parseStartTag()
      handleStartTag()
      // 如果是结束标签，调用
      parseEndTag()
   }

   parseStartTag(){}
   handleStartTag(){
      /* 解析开始标签生成的元素描述对象 */
      stack.push(/*当前元素描述对象*/)
      // 调用options.start
      options.start()
   }
   parseEndTag(){
      let pos //pos是从后往前遍历stack数组找到第一个匹配元素的索引（这里省略了代码），也就是找到结束时对应的开始标签元素在stack中的索引
      // 更新stack栈，剔除匹配到的开始标签以及之后的元素
      stack.length = pos
      // 调用options.end
      options.end()
   }
}

parse(template,options){
   // 根节点AST
   let root;
   const stack = [];
   let currentParent;
  /*...*/
   parseHTML(template,{
      /*...*/
      start(tag, attrs, unary, start, end){
         let element = createASTElement(tag, attrs, currentParent);
         if (!root) {
            // 如果root变量还没值，将该标签赋值给root
            root = element;
         }
         // currentParent 变量的值更新为当前元素
         // currentParent 始终存储的是 stack 栈顶的元素，即当前解析元素的父级
         currentParent = element;
         // 将当前元素推入到stack栈中
         stack.push(element);
      },
      end(tag, start, end){
         // 拿到stack栈顶的元素，即当前结束标签对应的开始标签的AST对象
         const element = stack[stack.length - 1];
         // stack长度减一
         stack.length -= 1;
         // 更新currentParent，指向新的栈顶
         currentParent = stack[stack.length - 1];

         closeElement(element)
      },
      /*...*/
   })

   closeElement(){
      /*...*/
      if(currentParent){
         // 将当前节点推入到父元素的children中
         currentParent.children.push(element);
      }
      /*...*/
   }
}
```
先弄清楚创建AST树的过程，具体的代码分析后面再说。  
- 以下面的模板为例，先不考虑特殊情况
```js
<template>
<div>
   <h1></h1>
   <h2></h2>
</div>
</template>
```
可以看到parseHTML和parse中都有一个stack数组，**以stackH和stack进行区分**  
parseHTML解析到div开始标签，将div推入到stackH,此时stackH为
```js
stackH = [{tag:"div"}]
```
同时调用```options.start()```，创建AST，currentParent更新为该div，并将该AST对象推入到stack，
```js
AST = [{tag:"div"}]
currentParent = {tag:"div"}
stack = [{tag:"div"}]
```
接着解析到h1开始标签，重复上面步骤，变为
```js
stackH = [{tag:"div"},{tag:"h1"}]

currentParent = {tag:"h1"}
stack = [{tag:"div"},{tag:"h1"}]
```
接着解析到h1结束标签，调用```parseEndTag```，更新stackH
```js
stackH = [{tag:"div"}]
```
同时调用```options.end()```，关键代码就是```stack.length -= 1;currentParent = stack[stack.length - 1];currentParent.children.push(element);```，**匹配到结束标签时，stack长度减一，currentParent为栈顶最后一个元素，也就是h1的父级div，然后将h1推入到div的children属性中**，也就构建了一个树形结构的AST
```js
AST = [
         {
            tag:"div",
            children:[
               {
                  tag:"h1"
               }
            ]
         }
      ]

currentParent = {tag:"div"}
stack = [{tag:"div"}]
```
接着解析到h2开始标签，与上面的步骤一样，生成的AST树为
```js
stackH = [{tag:"div"}]
AST = [
         {
            tag:"div",
            children:[
               {
                  tag:"h1"
               },
               {
                  tag:"h2"
               },
            ]
         }
      ]

currentParent = {tag:"div"}
stack = [{tag:"div"}]
```
最后解析到div根标签的结束标签
```js
stackH = []
AST = [
         {
            tag:"div",
            children:[
               {
                  tag:"h1"
               },
               {
                  tag:"h2"
               },
            ]
         }
      ]
currentParent = undefined
stack = []
```
以上就是不考虑特殊情况的解析过程，通过操作stack数组来构建一个AST树。我们来看stack数组在解析开始到解析结束时的变化
```js
// 开始解析，div开始
stack = [{tag:"div"}]
// 解析h1开始
stack = [{tag:"div"},{tag:"h1"}]
// 解析h1结束
stack = [{tag:"div"}]
// 解析h2开始
stack = [{tag:"div"},{tag:"h2"}]
// 解析h2结束
stack = [{tag:"div"}]
// 结束解析，div结束
stack = []
```
可以看到，其实这就是一个入队和出队的过程，**解析开始标签入队，解析完该标签出队，那么此时栈顶的标签就是该标签的父节点**，解析结束时只需要把自己添加到父节点的children属性中，这样就构成了一个完整的AST树结构。  
那么有人会问stackH的作用是什么？好像这里并没有体现，这就要说到特殊情况的解析了，比如漏写了结束标签，一元标签等等，这些情况要怎么处理

## 特殊情况的解析
### 缺少结束标签
比如下面的h2缺少结束标签
```js
<template>
<div>
   <h1></h1>
   <h2>
   <h3></h3>
</div>
</template>
```
获取上面模板字符时，会先经过浏览器的处理，缺少的h2结束标签会进行补全，
```js
   <h1></h1>
   <h2></h2>
   <h3></h3>
```
实际模板字符串已经是完整的了，而直接使用template字符串形式
```js
let template = "<div><h1>h1</h1><h2>h2<h3>h3<h3/><div/>";
```
经过vue的解析后会变成
```js
   <h1></h1>
   <h2><h3></h3></h2>
```
并没有与浏览器的行为保持一致，暂时发现只有h系列的标签会有这样的效果。下面来看看vue怎么处理的

根据正常情况的解析，当解析到h3标签时，因为h2标签没有匹配到结束标签，所以h2还是存在与stack中，stack数组为
```js
stackH = [{tag:"div"},{tag:"h2"},{tag:"h3"}]
stack = [{tag:"div"},{tag:"h2"},{tag:"h3"}]
```
当解析完h3时，stack变为
```js
stackH = [{tag:"div"},{tag:"h2"}]
stack = [{tag:"div"},{tag:"h2"}]
```
而h3被推入到了h2的children属性中
```js
h2AST = [
   {
      tag:"h2",
      children:[
         {
            tag:"h3",
         }
      ]
   }
]
```
接下来要怎么处理没有结束标签的h2呢？先补充下```parseEndTag```中的代码
```js
parseEndTag(){
   let pos //pos是从后往前遍历stack数组找到第一个匹配元素的索引（这里省略了代码），也就是找到结束时对应的开始标签元素在stack中的索引
   // 更新stack栈，剔除匹配到的开始标签以及之后的元素
   if (pos >= 0) {
      // 从后往前遍历stack，遍历到pos停止
      for (let i = stack.length - 1; i >= pos; i--) {
         // 调用options.end
         options.end(stack[i].tag, start, end)
      }
      // 更新stack栈，剔除匹配到的开始标签以及之后的元素
      stack.length = pos  
   }
}
```
最后匹配到div结束标签，**先找到div在stackH中的索引，从后往前遍历stackH，逐个调用```options.end```**，这里也就处理了没有结束标签的h2。形成的AST为
```js
AST = [
         {
            tag:"div",
            children:[
               {
                  tag:"h1"
               },
               {
                  tag:"h2",
                  children:[
                     {
                        tag:"h3"
                     }
                  ]
               },
            ]
         }
      ]
```
所以stackH的作用就是，**解析结束标签时，找到在stackH的索引，如果索引后面还存在元素，说明这些元素都缺少了结束标签，同时会抛出异常，立即调用```options.end```将其闭合，保证AST结构的正确性**

### 一元标签
```js
<template>
<div>
   <img />
</div>
</template>
```
如下是处理一元标签的代码
```js
handleStartTag(){
    const unary = isUnaryTag(tagName) || !!unarySlash //判断是不是一元标签
    if (!unary) {
      // 如果不是一元标签
      // 推到stack数组中
      stack.push({ tag: tagName })
    }

    options.start(tagName, attrs, unary, match.start, match.end)
}

start(){
   // 如果不是一元标签
   if (!unary) {
     // currentParent 变量的值更新为当前元素
     // currentParent 始终存储的是 stack 栈顶的元素，即当前解析元素的父级
     currentParent = element;
     // 将当前元素推入到stack栈中
     stack.push(element);
   } else {
     // 一元标签
     closeElement(element);
   }
}
```
当处理img标签时，一元标签不会推入到stackH数组中。调用```options.start```，如果是一元标签直接调用```closeElement```进行关闭

### br和只有p结束标签
```js
<template>
<div>
   </div>
   </br>
   </p>
</div>
</template>
```
对于```</br>```和```</p>```标签浏览器会解析为```<br>```和```<p></p>```，而单独的```</div>```浏览器则会省略掉。查看下面代码，vue保持和浏览器行为一致
```js
parseEndTag(){
   let pos //pos是从后往前遍历stack数组找到第一个匹配元素的索引（这里省略了代码），也就是找到结束时对应的开始标签元素在stack中的索引
   
   // 更新stack栈，剔除匹配到的开始标签以及之后的元素
   if (pos >= 0) {
      // 从后往前遍历stack，遍历到pos停止
      for (let i = stack.length - 1; i >= pos; i--) {
         // 调用options.end
         options.end(stack[i].tag, start, end)
      }
      // 更新stack栈，剔除匹配到的开始标签以及之后的元素
      stack.length = pos  

   // 进入下面的else if说明没在stack中匹配到，pos为-1
   } else if (lowerCasedTagName === 'br') {
      // 当前处理的闭合标签为 </br> 标签
      options.start(tagName, [], true, start, end)// 第三个参数true，说明为一元标签
   } else if (lowerCasedTagName === 'p') {
      // 当前处理的闭合标签为 </p> 标签
      options.start(tagName, [], false, start, end)

      options.end(tagName, start, end)
   }
}
```
解析到上面的```</br>```和```</p>```标签时，因为没有对应的开始标签，没在stackH中找到，pos为-1，进入下面的```else if```条件，可以看到如果是br，只调用了```options.start```，这是因为br是一元标签，这里传入了第三个参数，表示该标签是一元标签，一元标签的处理在上面已经说过了。如果是p标签，则直接调用```options.start```和```options.end```

### p标签内的Phrasing content模型

p标签内的标签不能是Phrasing content模型，
```js
<template>
<div>
   <p><h2></h2></p>
</div>
</template>
```
如果是会解析成```<p></p><h2></h2><p></p>```
```js
handleStartTag(){
   if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
     // 关闭上一个标签，也就是p标签
     parseEndTag(lastTag)
   }
   /*...*/
   options.start()
}
```
当解析h2的开始标签时，会进行一个判断上一个标签如果是p标签，且当前标签类型是Phrasing content模型，会立即调用```parseEndTag```去关闭p标签。**注意此时还没有调用```options.start```，stack栈顶的元素还是p标签**。往下解析完h2标签，只剩一个p的结束标签，即上面一种情况的处理。

### 可以省略结束标签的标签
```js
<template>
<div>
   <p>p1
   <p>p2
</div>
</template>
```
对于可以省略结束标签的标签，当连续出现的时候vue会解析成同级别的```<p>p1</p><p>p2</p>```，而不像div标签，如果省略结束标签的话会形成嵌套的结构。上述的行为与浏览器保持一致，看下面代码是如何实现的
```js
handleStartTag(){
   // 可以省略结束标签的标签，且上一个开始标签与当前开始标签一样
   if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
   /*...*/
   options.start()
}
```
 当解析到第二个p标签时，进入到```if```条件，会立即关闭当前标签，**因为当前标签还没有推入到stack中，所以实际上```parseEndTag```关闭的是上一个标签**，这就是为什么没有像div一样形成嵌套结构  

 以上就是对于特殊情况的处理
