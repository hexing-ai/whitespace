# 第三方声明

项目自有代码采用根目录 MIT 许可证。第三方组件、资源及商标不因该许可证而改变原有权利。

| 内容 | 许可与处理 |
| --- | --- |
| WebGL Fluid Simulation 改造部分 | MIT；版权和许可见 `public/licenses/webgl-fluid.txt`，版本及改造信息见 `src/features/hero-ink/upstream.json` |
| Lucide 图标 | ISC；见 `public/licenses/lucide.txt` |
| npm 依赖 | 以各依赖自带许可证为准，准确版本见 `package-lock.json` |
| 字体 | 使用设备已有的系统字体栈，不打包或下载商业字体文件 |

页面截图展示本项目真实界面和内置示例数据。模型输出属于一次实际调用结果，不是每次运行的保证。

## 首页媒体

应产品要求，当前首页恢复原参考视频的雪山、云雾与海面画面。原视频URL：

https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260821_114821_a8ca298f-be2c-4613-a4dd-51b69e16bbde.mp4

仓库包含之前生成的241张WebP帧和山景封面，未包含原MP4；访客直接读取图片帧，不在浏览器转换视频。哈希及尺寸见`src/features/home/frames-manifest.json`。`docs/images/home.png`为包含背景的实际页面截图。

这些外部媒体及其派生帧不属于自有代码MIT许可范围。源链接未附独立再分发许可，完整媒体授权范围尚待补充；二次分发或商用时需确认权利或替换媒体。v1.2.0的原创SVG山形已从当前页面移除，不能将其MIT声明套用于恢复的参考素材。
