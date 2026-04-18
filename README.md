# PhotoBook Studio

> 把美好的回忆，变成捧在手里的画册。

画册/相册排版桌面工具，支持图片排版、文字编辑、模板布局、PDF/PNG 导出。

## 功能特性

- 🖼 **图片导入** — 支持文件/文件夹导入、拖拽导入
- ✂️ **画布编辑** — Fabric.js 引擎，拖拽/缩放/旋转
- 📝 **文字工具** — 添加文字，支持多种字体和样式
- 📄 **多页面管理** — 页面增删、缩略图导航
- 🎨 **6 种模板** — 1图、2图、3图、4图、网格布局
- 🖼 **图片美化** — 边框、阴影、圆角、不透明度
- 📐 **页面设置** — A5/A4/方形/自定义尺寸，纵向/横向
- 📄 **导出 PDF** — 多页画册导出为 PDF 文件
- 🖼 **导出 PNG** — 单页或全部导出为图片
- ↩️ **撤销/重做** — 支持 50 步历史记录
- 🔍 **缩放** — 25%-300% 缩放浏览
- ⌨️ **快捷键** — V 选择、T 文字、Delete 删除、Ctrl+Z/Y 撤销/重做
- 🎨 **深色主题** — 护眼深色界面

## 运行方式

```bash
# 安装依赖
npm install

# 启动开发模式
npm start
```

## 打包为安装包

```bash
# 安装打包工具（如未安装）
npm install -g electron-builder

# 打包 Windows 安装包
npm run build
```

打包后的文件在 `dist/` 目录下。

## 项目结构

```
photo-book-studio/
├── index.html        # 主页面
├── package.json      # 项目配置
├── SPEC.md           # 产品规格书
├── docs/
│   └── mvp-requirements.md  # MVP 需求文档
└── src/
    ├── main.js       # Electron 主进程
    ├── preload.js    # 预加载脚本（安全桥接）
    ├── renderer.js   # 渲染进程逻辑
    └── styles.css    # 深色主题样式
```

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron | 桌面应用框架 |
| Fabric.js | 画布交互引擎 |
| jsPDF | PDF 文件生成 |
| html2canvas | 画布截图 |
| Node.js | 运行时环境 |

## 系统要求

- Windows 10 及以上（64位）
- 4GB RAM 及以上
- 1280×720 及以上分辨率
