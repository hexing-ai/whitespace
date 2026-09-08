# 第三方声明

项目自有代码采用根目录 MIT 许可证。第三方组件、资源及商标不因该许可证而改变原有权利。

| 内容 | 许可与处理 |
| --- | --- |
| WebGL Fluid Simulation 改造部分 | MIT；版权和许可见 `public/licenses/webgl-fluid.txt`，版本及改造信息见 `src/features/hero-ink/upstream.json` |
| Lucide 图标 | ISC；见 `public/licenses/lucide.txt` |
| MP4Box.js | BSD-3-Clause；见 `public/licenses/mp4box.txt` |
| npm 依赖 | 以各依赖自带许可证为准，准确版本见 `package-lock.json` |
| 字体 | 使用设备已有的系统字体栈，不打包或下载商业字体文件 |

页面截图展示本项目真实界面和内置示例数据。模型输出属于一次实际调用结果，不是每次运行的保证。

## 首页媒体

首页视频通过外部 CDN 读取，地址集中在 `src/features/home/config.ts`；本仓库不包含 MP4 原文件。`public/media/whitespace-mountains.webp` 是首页封面，`docs/images/home.png` 是含背景的页面截图。

这些媒体不纳入项目自有代码的 MIT 许可。现有源链接未附独立再分发许可证，媒体的完整授权范围尚待补充；二次分发或商用发布时应替换为自有或已获授权的媒体。工作台功能和业务规则不依赖具体山景素材。
