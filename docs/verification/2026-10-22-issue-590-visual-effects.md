# Issue 590：视觉特效开关与本机性能对照

## 环境和方法

- 本机 macOS 15.0、Apple M1 Pro（14 核 GPU）、Retina 屏幕；不是 issue 报告者的 Windows Iris Xe 环境。
- 原生 DSH 进程存在，但自动化读取其窗口失败，因此未声称完成原生 DSH 窗口的 GPU 对照。
- 在本机 Chrome 使用同一窗口、同一 1200×711 CSS 像素视口、同一个真实 React 19.1.1 预览壳与本地替身后端。原版使用本机已安装 2.5.8 的真实 `client.js`；其 CSS 与 2.5.9 完全相同。候选使用工作区真实前端文件。
- 每组静置采样 30 秒，每秒通过 IOAccelerator 的 `Device Utilization %` 读取整机 GPU；通过进程累计 CPU 时间差统计 Chrome 全进程组 CPU，同时记录 RSS 和 WindowServer。CPU 百分比以单核为 100%，并非整机 CPU 百分比。
- GPU 包含其他后台应用，不能直接归因成插件独占值；通过同一候选前端的开、关重复测试检查因果方向。各组保持其他应用状态，不运行生成请求作为测量负载。

## 实测

| 状态 | GPU 均值 | GPU 中位数 | Chrome 进程组 CPU 均值 | Chrome RSS 均值 |
| --- | ---: | ---: | ---: | ---: |
| 原版页面 | 71.50% | 72% | 65.45% | 773.21 MiB |
| 候选：特效关闭 | 28.27% | 27% | 51.29% | 784.86 MiB |
| 候选：特效开启 | 71.77% | 72% | 67.04% | 807.95 MiB |
| 候选：再次关闭 | 27.77% | 27% | 52.17% | 791.13 MiB |

重复关闭组较原版 GPU 均值降低约 61.2%；开启可恢复高负载，关闭可再次降低。没有观察到 RSS 改善，不能把本次修复描述为内存优化。此结果验证本机浏览器中前端视觉开关的效果，不代替原生 DSH 或 Windows Iris Xe 验收。

另有 20 秒 DSH 后台参考样本：DSH 进程组 CPU 平均 0.61%，整机 GPU 平均 15.6%。该样本没有可见 OFM 页面，仅作背景参考，未用于计算修复收益。

## 功能验证

- 默认关闭装饰特效；关闭时无全屏光斑节点，主面板计算样式 `backdrop-filter: none`。
- 鱼缸的水位、无障碍标签和可用度保留；关闭时仍有 3 条鱼、5 个气泡、2 层波浪和缸内光线动画，实际截图可见。
- 开启后恢复光斑节点与 `blur(18px)` 毛玻璃样式；再次关闭即时生效，重载后开关保持关闭。
- 系统减少动态效果模拟下，鱼缸内容和 100% 可用度标签保留，鱼的计算样式为 `animation-name: none`；检查后已取消模拟。
- 360px 窄屏检查：文档宽度 360px，无横向溢出，开关在可视区域内；检查后已恢复真实视口。
- 新增回归覆盖默认关闭、切换、重挂载、存储拒绝、文档可见性、鱼缸结构以及关闭数字滚动时不创建动画帧。

## 执行结果

- `npm run test:contributor`：78/78 套件通过。
- `node scripts/plugin-bench-ui-test.mjs`：8 项通过。
- `node scripts/picks-ui-test.mjs`、`node scripts/client-lint.mjs`：通过。
- `npm run typecheck`（adapter）、`npm run typecheck:standalone`：通过。
- 独立前端已重新构建，`node scripts/build-standalone-ui.mjs --check`、`node scripts/build-standalone-channels.mjs --check`：通过。
- `node --check client.js`、`git diff --check`：通过。

## 本机同步与限制

本机原插件包记录为 2.5.8，本轮仅备份并原子替换其 `client.js`，候选文件 SHA-256 与工作区一致；未修改账号、凭据、网关配置或后端实现。备份与原始采样、截图留在本机，不提交真实用户数据。原生窗口需刷新后加载候选，本轮尚未确认原生窗口激活后的占用。本轮未发布新版本，未验证 Windows/macOS 安装器或真实上游账号调用。
