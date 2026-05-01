# AGENTS.md

## 项目概览

这是一个安卓端本地漫画阅读器项目。当前实现形态是 React + Vite 前端、Node 本地预览后端、Capacitor Android 壳，以及一个自定义 Android 原生插件 `LocalManga`。

核心目标：

- 读取本地漫画目录中的漫画资源。
- 使用独立工作目录保存 App 产生的逻辑文件，避免污染漫画源目录。
- 支持自定义画廊的创建、重命名、删除和筛选。
- 支持给漫画增删 tag。
- 支持基于 tag 的搜索：输入 `A B` 表示同时包含 A 和 B，输入 `-B` 表示排除 B；当前不做并集搜索。
- 支持安卓端目录选择、目录扫描、图片页读取和阅读器。
- 支持把漫画第一页作为封面，第一页为 GIF 时封面也按 GIF 显示。
- 支持历史记录：记录阅览过的漫画、上次阅读页和最近阅读时间。
- 支持阅读器两指缩放、缩放后拖动查看图片、点击左右半屏翻页、滑动翻页、底部阅读进度条跳页。

## 技术栈

- 前端：React 19、Vite 7、lucide-react。
- Android 容器：Capacitor 8。
- Android 原生能力：Java 插件，基于 `DocumentFile` 和 Android Storage Access Framework。
- 浏览器调试后端：Node.js 内置 `http`、`fs`、`path`，无 Express。
- 数据存储：
  - 浏览器/电脑预览：`server.js` 把状态写入工作目录下的 `reader-state.json`。
  - Android APK：Capacitor Preferences 保存私有状态；如果选择了工作目录，也会写入工作目录下的 `reader-state.json`。

## 主要文件

- `package.json`
  - 定义 npm 脚本和依赖。
  - 常用脚本包括 `dev`、`server`、`build`、`android:sync`、`android:open`。

- `index.html`
  - Vite 应用入口 HTML。

- `src/main.jsx`
  - React 主应用。
  - 管理主视图状态：`home`、`detail`、`reader`、`search`、`galleries`、`settings`。
  - 主要组件：
    - `App`
    - `HomeView`
    - `ComicDetail`
    - `ReaderView`
    - `SearchView`
    - `GalleryManager`
    - `SettingsView`
  - 通过 `src/api.js` 读写数据，而不是直接操作文件。
  - 接入 Capacitor Android 返回键：非首页时返回上一级页面。

- `src/api.js`
  - 前端数据访问层。
  - 使用 `Capacitor.isNativePlatform()` 区分运行环境。
  - Android 环境下调用 `LocalManga` 原生插件和 Capacitor Preferences。
  - 浏览器环境下调用 `server.js` 提供的 `/api/*` 接口。
  - 重要方法：
    - `getState()`
    - `chooseComicRoot()`
    - `chooseWorkspaceRoot()`
    - `updateDirectories()`
    - `scanComics()`
    - `searchComics(query)`
    - `listComicPages(comic)`
    - `getComicCover(comic)`
    - `readComicPage(page)`
    - `updateComic(id, patch)`
    - `addComicTag(comicId, group, value)`
    - `removeComicTag(comicId, tagId)`
    - `createGallery(name)`
    - `renameGallery(id, name)`
    - `deleteGallery(id)`

- `src/styles.css`
  - 全部前端样式。
  - 移动端优先，模拟安卓阅读器视觉。
  - 画廊筛选条 `.gallery-filter` 支持横向滑动。
  - 详情页、搜索页、阅读器、设置页、画廊管理页都在这里定义样式。

- `server.js`
  - 浏览器调试和桌面预览用的本地 HTTP 服务。
  - 默认监听 `127.0.0.1:4173`。
  - 静态服务 `dist/`。
  - 提供 API：
    - `GET /api/state`
    - `PUT /api/directories`
    - `POST /api/scan`
    - `GET /api/search?q=...`
    - `GET /api/comics/:id/cover`
    - `PATCH /api/comics/:id`
    - `POST /api/comics/:id/tags`
    - `DELETE /api/comics/:id/tags/:tagId`
    - `POST /api/galleries`
    - `PATCH /api/galleries/:id`
    - `DELETE /api/galleries/:id`
  - 扫描逻辑：
    - 支持漫画文件扩展名：`.cbz`、`.zip`、`.pdf`、`.rar`、`.7z`。
    - 支持图片扩展名：`.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`、`.bmp`、`.avif`。
    - 图片文件夹会被视为一本漫画。
    - 浏览器预览会为图片文件夹记录第一页作为 `source.coverPath`，封面接口会读取该页。
    - 工作目录不能位于漫画目录内部，漫画目录也不能位于工作目录内部。

- `capacitor.config.json`
  - Capacitor 配置。
  - `appId`: `com.localmanga.reader`
  - `webDir`: `dist`
  - Android scheme: `https`

- `ANDROID_BUILD.md`
  - Android 打包说明。
  - 当前文件内容在终端中显示为乱码，但大意是 Capacitor/Android Studio 打包流程。

- `android/`
  - Capacitor 生成的 Android 工程。
  - 重要文件：
    - `android/app/src/main/java/com/localmanga/reader/MainActivity.java`
    - `android/app/src/main/java/com/localmanga/reader/LocalMangaPlugin.java`
    - `android/app/src/main/AndroidManifest.xml`
    - `android/app/build.gradle`
    - `android/variables.gradle`

- `android/app/src/main/java/com/localmanga/reader/LocalMangaPlugin.java`
  - 自定义 Capacitor 原生插件。
  - 插件名：`LocalManga`。
  - 已实现能力：
    - `pickComicRoot`
    - `pickWorkspaceRoot`
    - `scanComicRoot`
    - `listPages`
    - `readPage`
    - `readWorkspaceState`
    - `writeWorkspaceState`
  - 使用 `ACTION_OPEN_DOCUMENT_TREE` 获取目录授权。
  - 漫画目录只申请读取权限。
  - 工作目录申请读写权限。
  - 扫描安卓端漫画时，当前逻辑将漫画根目录下的每个子文件夹视为一本漫画，并读取其中图片作为页面。
  - 扫描时会把第一页 URI 记录为 `source.coverUri`，并记录 `source.coverMimeType`，用于封面显示。
  - 页面排序通过文件名中的数字和中文 Collator 辅助排序。

- `android/app/src/main/AndroidManifest.xml`
  - 当前权限只有 `android.permission.INTERNET`。
  - 目录访问依赖 Storage Access Framework，不依赖传统外部存储权限。

- `android/variables.gradle`
  - Android SDK 配置：
    - `minSdkVersion = 24`
    - `compileSdkVersion = 36`
    - `targetSdkVersion = 36`
    - Android Gradle Plugin 8.13.0
    - Gradle Wrapper 8.14.3

- `dist/`
  - Vite 构建产物。
  - 不要手动编辑，运行 `npm.cmd run build` 重新生成。

- `node_modules/`
  - npm 依赖目录。
  - 不要手动编辑。

- `app-workspace/`
  - 默认工作目录。
  - 当前读取时为空或没有 `reader-state.json`。

## 常用命令

安装依赖：

```powershell
npm.cmd install
```

前端开发服务器：

```powershell
npm.cmd run dev
```

构建前端：

```powershell
npm.cmd run build
```

运行本地后端和静态预览：

```powershell
npm.cmd run server
```

同步前端构建到 Android 工程：

```powershell
npm.cmd run android:sync
```

用 Android Studio 打开工程：

```powershell
npm.cmd run android:open
```

命令行构建 debug APK：

```powershell
cd android
.\gradlew.bat assembleDebug
```

当前命令行默认 Java 可能是 JDK 17，而 Capacitor Android/AGP 当前构建需要 JDK 21。若直接打包出现 `无效的源发行版：21`，可临时使用 Android Studio 自带 JDK：

```powershell
cd android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
.\gradlew.bat assembleDebug
```

debug APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 当前验证状态

最近一次已执行：

```powershell
npm.cmd run build
node --check server.js
npm.cmd run android:sync
cd android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
.\gradlew.bat assembleDebug
```

结果：均通过。

构建输出包含：

- `dist/index.html`
- `dist/assets/index-BbEGnAeX.css`
- `dist/assets/index-osuhDavE.js`
- `dist/assets/web-BLsXEDFE.js`
- `dist/assets/web-Bzp5Vrk8.js`

当前已有 debug APK：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

该 APK 文件时间为 `2026/4/29 22:40:33`，大小 `7,427,440 bytes`，约 `7.4 MB`。如果前端或 Android 插件改动后，需要重新运行同步和打包命令。

## 功能状态

首页：

- 顶部标题为本地漫画。
- 书架 tab 当前为两个：本地漫画、历史记录。
- 本地漫画页显示画廊筛选条，支持横向滑动。
- 历史记录页隐藏画廊筛选条，展示所有阅览过的漫画，不按画廊分类。
- 漫画卡片显示封面、标题、作者、页数、画廊。
- 封面优先使用漫画第一页；如果第一页是 GIF，则封面也显示 GIF。读取失败时回退到占位封面。
- 默认画廊名称为“默认画廊”，旧状态里的 `g1/????` 会迁移为“默认画廊”。

详情页：

- 展示封面、漫画名、阅读按钮、总页数。
- 已删除“已下载”按钮。
- 已去掉收藏、评分、分享、种子、档案、H@H 等功能。
- 已去掉星级评分系统。
- 支持 tag 展示、添加和删除。
- 支持切换所属画廊。

搜索页：

- 只保留搜索框和搜索结果。
- 空查询返回 0 条。
- `A B` 表示漫画必须同时包含 A 和 B。
- `-B` 表示排除包含 B 的漫画。
- 不提供显式交集/并集/差集按钮。
- 并集搜索已移除。

画廊管理：

- 支持新建画廊。
- 支持重命名画廊。
- 支持删除画廊。
- 删除画廊后，原属于该画廊的漫画会迁移到 fallback 画廊。

设置页：

- 支持选择漫画文件目录。
- 支持选择工作目录。
- 支持扫描漫画。
- 选择漫画目录、选择工作目录、扫描完成后的提示信息已修复为可读中文。
- 扫描漫画时显示动态进度条。
- 设计原则是漫画目录只读，工作目录保存 App 状态和逻辑文件。

阅读器：

- Android 原生环境可读取图片页。
- 浏览器预览环境目前不支持直接阅读本地漫画图片。
- 已移除底部“上一页/下一页”按钮。
- 未放大时支持点击左半屏上一页、点击右半屏下一页。
- 未放大时支持左右滑动翻页。
- 支持两指缩放，当前范围约为 `1x` 到 `4x`。
- 放大后支持单指拖动图片位置，滑动不会触发翻页。
- 点击屏幕底部区域可显示/隐藏阅读进度条；进度条左侧显示当前页，右侧显示总页数。
- 拖动阅读进度条可连续跳页，进度条不会因页码变化自动消失。
- 进入阅读器后会后台并发缓存整本漫画图片，翻页优先读取内存缓存；大体积漫画会增加内存占用。
- 阅读历史保存已改为退出阅读器时执行一次，避免每页更新历史导致缓存重建或翻页卡顿。

历史记录：

- 记录所有阅览过的漫画。
- 历史记录按最近阅读时间从新到旧排序。
- 从历史记录点击漫画会跳过详情页，直接进入阅读器。
- 进入阅读器时会恢复到上次离开的页数。
- 历史记录通过漫画字段 `readingPage` 和 `lastReadAt` 实现，不改变漫画的 `shelf`。

## 数据结构摘要

Comic 主要字段：

```js
{
  id,
  title,
  author,
  circle,
  language,
  pages,
  size,
  gallery,
  shelf,
  cover,
  source,
  tags,
  readingPage,
  lastReadAt
}
```

历史记录字段：

- `readingPage`：0 基页码索引，用于恢复阅读位置。
- `lastReadAt`：ISO 时间字符串，用于历史记录页从新到旧排序。

Tag 主要字段：

```js
{
  id,
  group,
  value
}
```

Gallery 主要字段：

```js
{
  id,
  name,
  color
}
```

Directories 主要字段：

```js
{
  comicRoot,
  comicRootUri,
  workspace,
  workspaceUri
}
```

Android 扫描出的漫画 `source` 示例：

```js
{
  type: "android-folder",
  rootUri,
  folderUri,
  coverUri,
  coverMimeType,
  pages
}
```

浏览器扫描出的图片文件夹漫画 `source` 示例：

```js
{
  type: "folder",
  path,
  coverPath
}
```

## 重要约定

- 不要手动编辑 `dist/`，通过 `npm.cmd run build` 生成。
- 不要手动编辑 `android/app/src/main/assets/public/`，它来自 Capacitor sync。
- 修改前端后，如果要进 Android APK，需要运行 `npm.cmd run android:sync`。
- 修改 Android 原生插件后，需要重新构建 APK。
- 漫画源目录必须保持只读原则，不要把 tag、索引、缩略图、阅读进度写进去。
- App 产生的状态文件应写入工作目录。
- 阅读历史只应写入 App 状态，不写入漫画源目录；当前阅读器在退出时保存一次历史，避免翻页时频繁写状态导致缓存重建。
- 浏览器预览通过 `server.js` 支持目录扫描，但浏览器端不能直接调用 Android 目录选择器。
- 浏览器预览可显示图片文件夹漫画封面，但仍不能直接进入阅读器读取本地图片页。
- Android 端通过 SAF 目录 URI 和持久授权访问目录。
- 如需本地快速测试 UI 和浏览器后端，可运行 `npm.cmd run server` 后打开 `http://127.0.0.1:4173`。
- 如需测试 SAF 目录授权、原生扫描、原生图片读取、缩放拖动等 Android 行为，应使用 Android Studio 模拟器或真机安装 debug APK。

## 已知风险和待处理事项

- PowerShell 默认输出有时会把 UTF-8 中文显示成乱码；读取源码时优先使用 `Get-Content -Encoding utf8`。`src/main.jsx`、`src/api.js`、`server.js` 中的核心中文文案目前可用 UTF-8 正常读取。
- `ANDROID_BUILD.md`、部分 Android 资源文件仍可能存在终端显示乱码，后续可统一检查并修复编码。
- `src/styles.css` 里仍残留一些已移除功能的样式，例如 `.quick-actions`、`.rating-row`、`.operator-tabs`、`.query-panel`、`.tag-browser` 等。当前不影响构建，但可在后续清理。
- `src/main.jsx` 底部仍有 `groupBy()`，当前搜索页已不再使用 tag 分组浏览，可能是遗留代码。
- Android 原生阅读器当前支持“漫画根目录下的子文件夹作为漫画，子文件夹内图片作为页面”。压缩包格式在 Node 扫描层会识别为漫画条目，但 Android 原生插件当前未实现压缩包解压阅读。
- 浏览器后端扫描支持文件夹和压缩包条目；浏览器端阅读本地图片页尚未实现，仅封面读取已实现。
- 阅读器“整本缓存”目前把图片 data URL 存在前端内存中，大型漫画或超高分辨率图片可能导致内存占用较高。
- `android/.gradle/`、`android/app/build/`、`android/capacitor-cordova-android-plugins/build/` 是构建产物，通常不应纳入源码管理。
- 当前环境中 `git` 命令不可用，不能依赖本地 git 状态来判断变更。

## 给后续 Agent 的建议

- 修改项目时优先读 `src/main.jsx`、`src/api.js`、`server.js` 和 `LocalMangaPlugin.java`。
- 如果要修 UI，主要改 `src/main.jsx` 和 `src/styles.css`。
- 如果要改数据逻辑，同时检查浏览器分支和 Android 原生分支：
  - 浏览器：`server.js`
  - Android：`src/api.js` + `LocalMangaPlugin.java`
- 如果要改目录/文件访问能力，优先保持“双目录隔离”设计。
- 任何涉及 Android 文件读写的功能，都要考虑 SAF URI、持久权限、只读漫画目录、工作目录写入这四件事。
- 如果要改阅读器，注意不要让 `ReaderView` 因 `comic` 对象字段更新而重建页列表和缓存；当前页列表初始化应只随 `comic.id` 变化。
- 如果要改历史记录，优先保持“退出阅读器时保存一次”的策略，避免每页写入导致翻页卡顿。
- 每次改完前端至少运行 `npm.cmd run build`。
- 每次准备 APK 至少运行 `npm.cmd run android:sync`，再运行 `.\gradlew.bat assembleDebug`。
