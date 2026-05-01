# Local Manga Browser

一个面向 Android 本地文件的漫画阅读器。项目使用 React + Vite 构建前端界面，通过 Capacitor 打包 Android 应用，并提供自定义原生插件 `LocalManga` 访问 Android Storage Access Framework 目录授权。

## 项目特色

- **本地漫画优先**：通过 Android 系统目录选择器读取本地漫画目录，不依赖云端服务。
- **漫画目录与工作目录隔离**：漫画源目录只读，App 产生的状态、画廊、tag、历史记录等逻辑文件写入独立工作目录，避免污染漫画文件夹。
- **自定义画廊**：支持创建、重命名、删除画廊，并按画廊筛选漫画。首页显示当前画廊，进入独立画廊选择页后可用类似漫画卡片的方式选择画廊。
- **封面缓存**：封面统一走共享缓存，App 获取漫画列表后会后台预加载封面。主页、历史记录、搜索页、详情页、画廊选择页以及后续新增的 `Cover` 组件位置都会复用缓存，减少临时加载闪烁。
- **第一页作为封面**：优先使用漫画第一页作为封面，第一页是 GIF 时封面也按 GIF 显示。
- **tag 管理与搜索**：漫画详情页支持添加、删除 tag。搜索支持交集与排除语法，例如 `A B` 表示同时包含 A 和 B，`A -B` 表示包含 A 且排除 B。
- **阅读历史**：记录最近阅读漫画、上次阅读页和最近阅读时间，历史记录按最近阅读时间排序，点击历史记录可直接恢复阅读位置。
- **沉浸式阅读器**：阅读界面全屏显示漫画，不显示标题栏和返回按钮。
- **顺滑翻页**：未放大时支持点击左右半屏翻页、左右滑动翻页。滑动翻页时页面会跟随手指移动，松手后平滑切页或回弹。
- **缩放与拖动**：支持两指缩放，缩放后可单指拖动查看图片，缩放状态下不会误触发翻页。
- **进度条跳页**：点击底部区域显示/隐藏阅读进度条，拖动进度条可连续跳页。
- **浏览器预览后端**：提供 Node 本地预览后端，方便在电脑上调试 UI 和数据流程。

## 技术栈

- 前端：React 19、Vite 7、lucide-react
- Android 容器：Capacitor 8
- Android 原生能力：Java 插件、`DocumentFile`、Storage Access Framework
- 本地预览后端：Node.js 内置 `http`、`fs`、`path`
- 状态存储：
  - 浏览器预览：工作目录下的 `reader-state.json`
  - Android：Capacitor Preferences；选择工作目录后也会同步写入工作目录下的 `reader-state.json`

## 目录结构

```text
.
├── src/
│   ├── main.jsx        # React 主应用、页面和阅读器逻辑
│   ├── api.js          # 前端数据访问层，区分浏览器和 Android 原生环境
│   └── styles.css      # 全部 UI 样式
├── server.js           # 浏览器预览用本地 HTTP 服务和 API
├── android/            # Capacitor Android 工程
├── capacitor.config.json
├── package.json
└── ANDROID_BUILD.md
```

## 环境准备

安装依赖：

```powershell
npm.cmd install
```

如果需要命令行打 Android APK，建议使用 JDK 21。当前 Android Studio 自带 JBR 通常可直接使用：

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
```

## 本地开发与预览

启动 Vite 前端开发服务器：

```powershell
npm.cmd run dev
```

启动本地预览后端和静态服务：

```powershell
npm.cmd run server
```

默认访问：

```text
http://127.0.0.1:4173
```

注意：浏览器预览可用于调试界面、扫描逻辑和部分数据流程，但浏览器无法使用 Android SAF 目录授权，因此真实的 Android 本地图片读取、目录授权、阅读器手势体验需要安装 APK 到真机或模拟器测试。

## 构建前端

```powershell
npm.cmd run build
```

构建产物会输出到 `dist/`。不要手动编辑 `dist/`，需要更新时重新运行构建命令。

## 同步到 Android 工程

前端改动后，如需打包进 APK：

```powershell
npm.cmd run android:sync
```

该命令会先执行前端构建，再把 `dist/` 同步到 Android 工程。

## 构建 Debug APK

```powershell
cd android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
.\gradlew.bat assembleDebug
```

APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

安装到已连接的 Android 设备：

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

## App 使用流程

1. 打开 App，进入设置页。
2. 选择漫画文件目录。漫画目录只用于读取漫画资源。
3. 选择工作目录。工作目录用于保存 App 状态文件。
4. 点击扫描漫画。
5. 回到首页查看本地漫画。
6. 点击“选择画廊”进入画廊选择页，选择全部画廊或某个自定义画廊。
7. 进入漫画详情页可阅读、切换画廊、添加或删除 tag。
8. 阅读器中可点击左右半屏翻页、滑动翻页、双指缩放、缩放后拖动图片。
9. 点击屏幕底部区域可显示阅读进度条并拖动跳页。

## 搜索语法

- `A B`：搜索同时包含 tag `A` 和 tag `B` 的漫画。
- `A -B`：搜索包含 `A` 且不包含 `B` 的漫画。
- 空查询返回 0 条结果。

当前搜索语义是交集与排除，不做并集搜索。

## 数据与文件约定

- 漫画源目录保持只读。
- tag、画廊、历史记录、阅读进度等 App 状态写入 App 状态存储或工作目录。
- `node_modules/`、`dist/`、`app-workspace/`、Android build 输出不纳入 Git。
- 修改前端后至少运行 `npm.cmd run build`。
- 准备 APK 时运行 `npm.cmd run android:sync`，然后运行 Android Gradle 构建。

## 当前限制

- Android 原生扫描当前主要支持漫画根目录下的子文件夹，每个子文件夹作为一本漫画，子文件夹内图片作为页面。
- 浏览器预览后端可识别图片文件夹和压缩包条目，但浏览器端不能直接像 Android 一样读取本地漫画页。
- 压缩包格式条目可被扫描识别，但 Android 原生插件尚未实现压缩包解压阅读。
- 阅读器会缓存图片 data URL，大体积漫画或超高分辨率图片会增加内存占用。
