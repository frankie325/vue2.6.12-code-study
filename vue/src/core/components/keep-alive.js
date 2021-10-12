/* @flow */

import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

type CacheEntry = {
  name: ?string;
  tag: ?string;
  componentInstance: Component;
};

type CacheEntryMap = { [key: string]: ?CacheEntry };

// 拿到组件的名称，以选项中的name属性优先
function getComponentName (opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag)
}
// 组件名称是否符合include和exclude
function matches (pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) { //如果是数组，看组件的名字是不是在其中
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') { //如果是字符，以逗号分割，看组件的名字是不是在其中
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) { //如果是正则，看组件的名字是否符合正则表达式
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false //都没匹配到，返回false
}

// 根据include和exclude移除移除缓存的组件
function pruneCache (keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance
  for (const key in cache) { //遍历缓存的组件
    const entry: ?CacheEntry = cache[key]
    if (entry) {
      const name: ?string = entry.name //拿到组件名字
      if (name && !filter(name)) { //如果组件名称不在include中 或者 在exclude属性中
        // 则将该组件从缓存中移除
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

// 从this.cache移除指定缓存的组件VNode
function pruneCacheEntry (
  cache: CacheEntryMap,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  const entry: ?CacheEntry = cache[key] //拿到该组件VNode
  if (entry && (!current || entry.tag !== current.tag)) {
    // 销毁组件该实例
    entry.componentInstance.$destroy()
  }
  // 清空在this.cache中的值
  cache[key] = null
  // key属性从this.keys中移除
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]

export default {
  name: 'keep-alive',
  abstract: true,

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  methods: {
    cacheVNode() {
      const { cache, keys, vnodeToCache, keyToCache } = this
      if (vnodeToCache) {
        const { tag, componentInstance, componentOptions } = vnodeToCache
        // 将组件实例添加到this.cache上
        cache[keyToCache] = {
          name: getComponentName(componentOptions),
          tag,
          componentInstance,
        }
        // key属性存到this.keys
        keys.push(keyToCache)
        // prune oldest entry
        if (this.max && keys.length > parseInt(this.max)) {
          // 如果缓存的组件数量大于了用户传入的max属性限制，将第一个缓存的组件移除
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
        // this.vnodeToCache置为null
        this.vnodeToCache = null
      }
    }
  },

  created () {
    // 往keep-alive组件实例上添加cache属性，为对象，缓存组件VNode
    this.cache = Object.create(null)
    // 用来储存缓存组件VNode的key属性
    this.keys = []
  },

  destroyed () {
    // keep-alive销毁时，也清空缓存的组件
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },
  mounted () {
    this.cacheVNode()
    // 监听include的变化
    this.$watch('include', val => {
      // 缓存的组件名称不在include中，则移除
      pruneCache(this, name => matches(val, name))
    })
    // 监听include的变化
    this.$watch('exclude', val => {
      // 缓存的组件名称在exclude中，则移除
      pruneCache(this, name => !matches(val, name))
    })
  },

  updated () {
    this.cacheVNode()
  },

  render () {
    const slot = this.$slots.default //拿到keep-alive包裹的内容，为VNode数组
    const vnode: VNode = getFirstComponentChild(slot) //拿到数组中第一个组件VNode 
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    if (componentOptions) {
      // check pattern
      const name: ?string = getComponentName(componentOptions) //拿到组件名称
      const { include, exclude } = this //拿到用户传入的include，exclude配置
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        // 如果该组件名称在exclude内或者不在include内，直接返回，不用缓存
        return vnode
      }

      const { cache, keys } = this
      const key: ?string = vnode.key == null //组件上如果不存在key属性
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        // 相同的组件可能
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '') //则创建一个key属性
        : vnode.key //有就用该key属性为键

      if (cache[key]) { //如果存在缓存中
        // componentInstance赋值为缓存中的componentInstance
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // 将key从keys中移除，再添加，保证是最新的
        remove(keys, key)
        keys.push(key)
      } else {
        // delay setting the cache until update
        // 将该组件VNode和key暂时保存到这两个属性上，等到更新阶段，进行缓存
        this.vnodeToCache = vnode
        this.keyToCache = key
      }

      // 该组件的data.keepAlive设置为true，说明该组件被keep-alive包裹
      vnode.data.keepAlive = true
    }
    // 返回该组件VNode
    return vnode || (slot && slot[0])
  }
}
