# performance

Performance 接口可以获取到当前页面中与性能相关的信息

- **performance.navigation**

```js
// 对象提供了在指定的时间段里发生的操作相关信息，包括页面是加载还是刷新、发生了多少次重定向等等
{
    type: 1,
    // 0:当前页面是通过点击链接，书签和表单提交，或者脚本操作，或者在url中直接输入地址，type值为0
    // 1:点击刷新页面按钮或者通过Location.reload()方法显示的页面，type值为1
    // 2:页面通过历史记录和前进后退访问时。type值为2
    // 3:任何其他方式，type值为255
    redirectCount: 0
    // 表示在到达这个页面之前重定向了多少次。
}         
```
- **performance.timing**  
performance对象的timing属性指向一个对象，它包含了各种与浏览器性能有关的时间数据，提供浏览器处理网页各个阶段的耗时

- **performance.memory**
```js
// 可以获取到基本内存使用情况的对象
{
    usedJSHeapSize:  16100000, // JS 对象（包括V8引擎内部对象）占用的内存，一定小于 totalJSHeapSize，否则可能出现内存泄漏
    totalJSHeapSize: 35100000, // 已分配的堆体积（可使用的内存）
    jsHeapSizeLimit: 793000000 // 上下文内可用堆的最大体积（内存大小限制）
},

```
- **performance.timeOrigin**  
返回性能测量开始时的时间的高精度时间戳

- **performance.getEntries()**  
此方法返回 PerformanceEntry 对象数组,这个接口是获取所有资源文件加载信息的方法

- **performance.getEntriesByName()**    
根据资源的name获取相应的数据

- **performance.getEntriesByType()**    
根据资源的entryType获取相应的数据

::: tip
示例
:::

```js
 // 标记一个开始点，俗称打点
    performance.mark("mySetTimeout-start");

    // 等待1000ms
    setTimeout(function () {
      // 标记一个结束点
      performance.mark("mySetTimeout-end");

      // 标记开始点和结束点之间的时间戳
      //  measure方法执行后，mySetTimeout可以被Performance的方法检查到(getEntries(), getEntriesByName() 或者 getEntriesByType()).
      performance.measure(
        "mySetTimeout",
        "mySetTimeout-start",
        "mySetTimeout-end"
      );

      // 获取所有名称为mySetTimeout的measures
      var measures = performance.getEntriesByName("mySetTimeout");
      var measure = measures[0];
      console.log("setTimeout milliseconds:", measure.duration);

      // 清除标记
      performance.clearMarks();
      performance.clearMeasures();
    }, 1000);
```
