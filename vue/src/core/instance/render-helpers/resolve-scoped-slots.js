/* @flow */

/*
处理组件VNode上的ScopedSlots属性
生成如下对象
 {
   $stable:true, //是否需要强制更新插槽内容，true为不要
   slotTarget: function ({ msg }) {
            // 使用了v-if，会包一层三目运算符
            return showCenter
              ? _c("div", data, children, normalizationType)
              : undefined;
            },
   slotTarget: function (){},
   ...
   $key: "xxx"//根据插槽内容生成的唯一的hash值，插槽内容变化了，hash值也会跟着变化
 }
*/ 
export function resolveScopedSlots (
  fns: ScopedSlotsData, // see flow/vnode
  res?: Object,
  // the following are added in 2.6
  hasDynamicKeys?: boolean,
  contentHashKey?: number
): { [key: string]: Function, $stable: boolean } {
  res = res || { $stable: !hasDynamicKeys } 
  for (let i = 0; i < fns.length; i++) { //遍历scopedSlots数据
    const slot = fns[i] 
    if (Array.isArray(slot)) { //如果是数组，继续递归处理
      resolveScopedSlots(slot, res, hasDynamicKeys)
    } else if (slot) {
      // marker for reverse proxying v-slot without scope on this.$slots
      if (slot.proxy) {
        // 如果proxy为true
        slot.fn.proxy = true//往fn上添加proxy属性
      }
      // 将fn添加到res上
      res[slot.key] = slot.fn
    }
  }
  if (contentHashKey) { //hash值如果存在，添加到$key属性上
    (res: any).$key = contentHashKey
  }
  return res
}
