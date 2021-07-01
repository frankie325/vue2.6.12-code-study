module.exports = {
    base: "/vue-notes/", //部署时的文件夹路径
    title: "笔记",
    description: "write by kfg",
    markdown: {
        lineNumbers: true,//显示代码块的行数
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
                    collapsable: false, //是否可折叠
                    sidebarDepth: 1, //默认情况下，侧边栏会自动地显示由当前页面的标题（headers）组成的链接，并按照页面本身的结构进行嵌套,默认的深度是 1，它将提取到 h2 的标题（0-2）
                    children: [""], //""会读取文件夹下的README.md
                },
                {
                    title: "初始化过程",
                    collapsable: false,
                    children: ["entry/entry","entry/state"],
                    sidebarDepth: 2,
                },
                {
                    title: "响应式原理",
                    collapsable: false,
                    children: ["observe/observe","observe/queue"],
                    sidebarDepth: 2,
                },
                {
                    title: "全局方法",
                    collapsable: false,
                    children: ["global-api/global"], 
                },
                {
                    title: "工具函数",
                    collapsable: false,
                    children: ["util/util","util/shared"],
                    sidebarDepth: 2,
                },
                {
                    title: "window接口",
                    collapsable: false,
                    children: ["window-api/window"], 
                }
            ],
        },
    },
};
