# Android 打包说明

这个项目已经接入 Capacitor，可以直接用 Android Studio 打开 `android/` 目录并打包 APK。

## 常用命令

```powershell
npm.cmd run android:sync
```

同步最新前端产物到 Android 工程。

```powershell
cd android
.\gradlew.bat assembleDebug
```

生成 debug APK，输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Android Studio

1. 打开 Android Studio。
2. 选择 `Open`。
3. 打开本项目下的 `android` 文件夹。
4. 等待 Gradle 同步完成。
5. 使用 `Build > Build Bundle(s) / APK(s) > Build APK(s)` 打包。

## 运行模式

- 浏览器/电脑调试时，前端仍可使用 `server.js` 提供的本地 API。
- Android APK 内运行时，不依赖 Node 后端，数据保存在 Capacitor Preferences 中。
- Android 版使用系统目录选择器授权漫画根目录，只读扫描目录，不会向漫画目录写入文件。
- 目录设置页分别提供漫画目录和工作目录选择按钮，不再直接展示完整文件路径。
- Android 系统返回手势已接入 App 内导航：在详情、搜索、画廊、设置和阅读页面边缘滑动会返回上一级页面。
- 支持的漫画结构：漫画根目录下每个二级文件夹是一部漫画，文件夹名是漫画名；文件夹内图片按文件名中的数字页码排序。
- 当前 Android 版已支持真实漫画目录扫描、图片页读取、tag 增删、画廊增删改、tag 交集/差集搜索和目录配置保存。
