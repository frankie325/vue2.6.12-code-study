module.exports = {
    base: "/vue-notes/", //部署时的文件夹路径
    title: "笔记",
    description: "write by kfg",
    markdown: {
        lineNumbers: true, //显示代码块的行数
    },
    themeConfig: {
        sidebar: "auto",
        logo: "/images/logo.png",
        // 导航栏
        nav: [
            { text: "Home", link: "/" }, //跳转到docs下的README.md
            { text: "vue源码", link: "/vue-code-study/" },
            // { text: "External", link: "https://google.com" },
        ],
        // 侧边栏
        sidebar: {
            "/vue-code-study/": [
                {
                    title: "前言",
                    collapsable: true, //是否可折叠
                    sidebarDepth: 1, //默认情况下，侧边栏会自动地显示由当前页面的标题（headers）组成的链接，并按照页面本身的结构进行嵌套,默认的深度是 1，它将提取到 h2 的标题（0-2）
                    children: [""], //""会读取文件夹下的README.md
                },
                {
                    title: "初始化过程",
                    collapsable: true,
                    children: ["entry/entry", "entry/state"],
                    sidebarDepth: 2,
                },
                {
                    title: "响应式原理",
                    collapsable: true,
                    children: ["observe/observe", "observe/queue"],
                    sidebarDepth: 2,
                },
                {
                    title: "编译器",
                    collapsable: true,
                    children: [
                        "compile/compile-entry",
                        "compile/compile-flow",
                        "compile/parse-html",
                        "compile/parse",
                        "compile/mark-static",
                        "compile/ast",
                        "compile/generate",
                        "compile/model",
                        "compile/events",
                    ],
                    sidebarDepth: 2,
                },
                {
                    title: "渲染函数",
                    collapsable: true,
                    children: ["render/render", "render/create-element", "render/create-component", "render/virtual-dom"],
                    sidebarDepth: 2,
                },
                {
                    title: "全局与实例方法/属性",
                    collapsable: true,
                    children: ["global-api/global", "global-api/instance"],
                    sidebarDepth: 2,
                },
                {
                    title: "工具函数",
                    collapsable: true,
                    children: ["util/util", "util/web-util", "util/shared"],
                    sidebarDepth: 2,
                },
                {
                    title: "window接口",
                    collapsable: true,
                    children: ["window-api/window"],
                    sidebarDepth: 2,
                },
                {
                    title: "Q&A",
                    collapsable: true,
                    children: ["question/q1"],
                    sidebarDepth: 2,
                },
            ],
        },
    },
};
