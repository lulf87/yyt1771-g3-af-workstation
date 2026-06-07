# AGENTS.md — YY/T 1771 AF Web Station G3 Codex 开发规范

本文件是 Codex 在本仓库中工作的最高优先级项目规范。任何代码、文档、测试、重构和修复都必须遵守本文件，以及 `docs/requirements/G3_需求规格说明书_v0.1.md` 中已经确认的产品需求。

---

## 0. 项目目标

G3 的目标不是简单修补 1 代或 2 代系统，而是重新建立一套可验证、可复现、可扩展的 YY/T 1771 风格 AF 视觉测量工作站。

核心业务目标：

```text
在温度变化过程中，持续识别 ROI 内待测物体整体外包络，提取正式 A/B 点，计算 distance_px，生成 temperature-distance 趋势曲线，用于后续 Af 判断。
```

最重要的产品原则：

```text
先稳定识别“待测物体整体外包络”，再谈 A/B 点、distance 曲线和报告。
```

---

## 1. Codex 每次开始任务前必须阅读的文件

每次开始新任务、修复 bug、重构、生成代码、修改 UI、修改算法或修改测试前，必须先检查：

```text
AGENTS.md
problem.md
docs/requirements/G3_需求规格说明书_v0.1.md
docs/milestones/G3_开发任务拆分_v0.1.md
docs/algorithms/G3_AB检测与外包络算法需求_v0.1.md
```

如果任务涉及架构、数据结构、离线数据、真实相机、温度同步、导出或浏览器 UI，还必须阅读对应文档：

```text
docs/architecture/G3_技术架构草案_v0.1.md
docs/data/G3_数据结构与manifest草案_v0.1.md
docs/data/G3_离线素材注册表_v0.1.md
docs/testing/G3_验收与真实浏览器复测清单_v0.1.md
```

如果任务涉及 Offline playback、Live offline run、A/C detector、temperature-distance 曲线或真实浏览器复测，还必须读取：

```text
configs/local/offline_datasets.local.json
```

---

## 2. 已锁定的 G3 核心需求

Codex 不得违背以下需求，除非用户明确修改需求。

### 2.1 检测对象

```text
A 类：球囊 / 网状支架类，仅 max-width，第一阶段必须实现。
C 类：多细支 / 多线束整体类，仅 max-width，第一阶段必须实现。
D 类：待定义对象，未来可能 max-width 或 min-width，第一阶段只预留接口。
```

### 2.2 A/B 点定义

对 A/C 类对象：

```text
ROI 主方向 = 待测物体长度方向 / 展开方向
A/B 测量轴 = 垂直于 ROI 主方向
distance_px = 目标整体外包络在该测量轴上的宽度
正式 A/B = ROI 内目标整体外包络最大宽度位置的两个外侧接触点
```

### 2.3 外包络规则

```text
A/B 必须在整体外包络上。
内部白色缝隙、内部暗线、纹理、交叉线、单根细支边界不能作为正式 A/B。
多细支 / 多线束必须视为一个整体目标。
外部 speck / 小黑点不能被识别为待测物体。
外包络可以跨过内部缝隙，但不能用纯凸包无脑包住大量外部空白。
A 类 BalloonEnvelopeDetector 不识别内部网格作为正式边界；应先增强白底暗色网状结构，形成 strut_mask / mesh_region，再用稳定行窗口或测量轴窗口提取左右整体外包络 max-width。
A 类可输出 outer_contour_debug / filled_contour_debug 作为诊断，但正式 distance_px 不强制依赖完整闭合实心轮廓。
A 类夹子、连接丝、支撑丝、窄尾即使进入 ROI，也不得决定正式 max-width A/B。
```

### 2.4 ROI 坐标规则

正式写法：

```text
系统必须使用统一、稳定、可复现的 measurement coordinates 进行正式测量。
默认 measurement coordinates 为原始图像 pixel 坐标。
前端可以缩放显示图像，但缩放只影响显示，不影响正式 ROI、A/B、distance 计算。
```

实现要求：

```text
浏览器显示坐标不得直接作为正式测量坐标。
前端拖拽出的 ROI 必须映射到 measurement coordinates。
同一数据、同一 ROI、同一参数，在不同浏览器缩放比例下必须得到相同 distance_px。
```

### 2.5 温度同步规则

```text
图像帧和温度时间戳目标误差：<= 10 ms。
A/B 检测结果始终保存。
Af 分析和 temperature-distance 曲线只使用 TEMP_SYNC_OK 或 TEMP_SYNC_INTERPOLATED 的点。
TEMP_SYNC_STALE / TEMP_SYNC_MISSING 点不得进入正式 Af 曲线。
```

### 2.6 Invalid 优先原则

```text
宁可输出 INVALID，也不能输出看似正常但实际错误的 A/B。
```

---

## 3. 本地离线素材 / Golden Dataset 调用规则

G3 第一阶段已经确认两组本地真实离线素材，Codex 在开发 Offline playback、Live offline run、A/C detector、温度同步、曲线和导出时必须优先使用。

离线素材配置文件：

```text
configs/local/offline_datasets.local.json
```

详细说明：

```text
docs/data/G3_离线素材注册表_v0.1.md
```

已确认 dataset id：

```text
golden_a_20260522_dev_lab  -> A_BALLOON_ENVELOPE -> BalloonEnvelopeDetector -> max_width
golden_c_20260529_dev_lab  -> C_BUNDLE_ENVELOPE  -> BundleEnvelopeDetector  -> max_width
```

本机素材目录：

```text
/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab
/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab
```

每个目录应包含：

```text
manifest.json
temperature.csv
frames/frame_*.npy
capture.avi  # 如存在，仅辅助查看，不作为正式分析输入
```

Codex 必须遵守：

```text
1. 不得在 backend/frontend 代码中硬编码用户本机绝对路径。
2. 必须通过 configs/local/offline_datasets.local.json 读取本地 dataset registry。
3. API、UI、测试和真实浏览器复测应使用 dataset id，而不是直接传绝对路径。
4. 如果配置文件不存在、路径不存在、manifest.json/temperature.csv/frames 缺失，必须登记到 problem.md。
5. 修复 A/C detector、ROI 坐标、Playback、Live offline run、Analysis 或 Export 问题后，必须使用对应真实 dataset 做真实浏览器复测。
6. A 类相关修复至少复测 golden_a_20260522_dev_lab。
7. C 类相关修复至少复测 golden_c_20260529_dev_lab。
```

---

## 4. 必须维护 problem.md

`problem.md` 是项目开发过程中所有问题、风险、bug、复测状态的唯一登记文件。

### 4.1 什么时候必须登记问题

遇到以下任一情况，Codex 必须立即在 `problem.md` 新增或更新条目：

```text
1. 发现 bug、异常、测试失败、UI 显示不一致。
2. 算法输出不符合 G3 A/B 或外包络定义。
3. A/B 点跳到内部缝隙、暗线、单根细支、speck 或夹具。
4. ROI 坐标或浏览器缩放导致 distance 不一致。
5. 温度同步状态、插值、stale 处理不符合需求。
6. Offline playback / Live offline run / Real camera run 结果不一致。
7. 导出 CSV / JSON / PNG 和 UI 显示结果不一致。
8. 本地离线素材路径不可访问、manifest.json 缺失、temperature.csv 缺失或 frames 缺失。
9. 某项需求无法实现或需要修改需求。
10. 真实浏览器复测失败。
11. 临时 workaround、技术债、未完成边界条件。
```

### 4.2 问题状态

`problem.md` 中只允许使用以下状态：

```text
OPEN                         已发现，未开始处理
IN_PROGRESS                  正在处理
FIXED_PENDING_BROWSER_RETEST 代码层面已修复，等待真实浏览器复测
RESOLVED_BROWSER_VERIFIED    已通过真实浏览器复测，可以关闭
REOPENED                     复测失败或问题复现，重新打开
BLOCKED                      被硬件、数据、需求或环境阻塞
WONTFIX                      明确决定不修，必须写清原因
```

### 4.3 解决问题时必须更新 problem.md

修复任何问题后，必须执行：

```text
1. 在 problem.md 中记录修改摘要。
2. 将状态改为 FIXED_PENDING_BROWSER_RETEST。
3. 执行真实浏览器复测。
4. 复测通过后，状态才能改为 RESOLVED_BROWSER_VERIFIED。
5. 记录复测日期、浏览器、数据集、页面、步骤、结果、截图或日志路径。
```

严禁：

```text
只因为单元测试通过，就把 UI/流程/检测问题标为 RESOLVED_BROWSER_VERIFIED。
只因为 HTTP API 返回正常，就把浏览器流程问题标为 RESOLVED_BROWSER_VERIFIED。
没有复测记录就标记“已解决”。
```

---

## 5. 真实浏览器复测强制规则

AGENTS.md 中的“真实浏览器复测”是硬性要求。

### 5.1 什么算真实浏览器复测

以下方式可以算真实浏览器复测：

```text
1. 使用 Chrome / Edge / Safari / Firefox 打开前端页面并操作。
2. 使用 Playwright / Selenium 驱动真实浏览器或 headless browser 执行页面流程。
3. 在浏览器中完成 Setup / Playback / Run / Analysis / Export 对应流程。
```

以下方式不算真实浏览器复测：

```text
1. 只跑 pytest。
2. 只跑 vitest。
3. 只调用 FastAPI HTTP endpoint。
4. 只检查函数返回值。
5. 只看 TypeScript 编译通过。
6. 只靠截图组件渲染但没有实际页面流程。
```

### 5.2 哪些修复必须真实浏览器复测

只要涉及以下任一内容，必须真实浏览器复测：

```text
ROI 拖拽、旋转、缩放、坐标映射
A/B overlay 显示
distance_px 显示
detector 参数切换
当前帧 probe
Offline playback
Live offline run
Run 页面实时显示
Analysis 曲线
Export 下载
temperature-distance 曲线
错误状态 / invalid 状态显示
折叠诊断面板
```

### 5.3 复测记录格式

每次真实浏览器复测必须在 `problem.md` 对应问题下记录：

```text
Retest date:
Browser:
OS:
Frontend URL:
Backend URL:
Dataset:
Page:
Steps:
Expected:
Actual:
Result: PASS / FAIL
Evidence: screenshot/log/export artifact path
```

### 5.4 无法真实浏览器复测时

如果当前环境不能启动真实浏览器或缺少硬件/数据，不能把问题标为已解决，只能标为：

```text
FIXED_PENDING_BROWSER_RETEST
```

或：

```text
BLOCKED
```

并写明阻塞原因。

---

## 6. 架构和实现约束

### 6.1 总体架构

```text
frontend: Vite + React + TypeScript
backend: FastAPI + Python 3.11+
vision: pure Python / OpenCV / NumPy
services: playback / run / analysis / export
storage: run manifest / artifacts / config snapshot
device adapters: camera / temperature lazy import
```

### 6.2 前端不得计算正式结果

```text
前端可以显示 ROI、overlay、A/B、distance 和曲线。
前端不得作为正式 A/B、distance、temperature-sync、Af 分析的计算源。
正式计算必须由 backend / vision / services 产生。
```

### 6.3 相机 SDK lazy import

```text
Hik MVS SDK 不得在应用启动或普通 import 阶段强制加载。
无相机、无 SDK 时，Offline playback / Live offline run / Re-analysis 必须仍可运行。
只有进入 Real camera preview/run 时才加载真实相机 adapter。
```

---

## 7. 提交前检查清单

每次提交前必须检查：

```text
[ ] 是否违反 A/C = max-width 的规则？
[ ] A/B 是否只来自整体外包络？
[ ] A 类是否只用网状整体左右外包络测宽，而不是内部网格或 debug 轮廓？
[ ] 内部缝隙 / 暗线 / 纹理 / 单根线是否被排除？
[ ] 夹子 / 连接丝 / 支撑丝 / 窄尾是否不会决定 A 类 max-width？
[ ] 外部 speck 是否不会被识别成目标？
[ ] ROI 坐标是否使用 measurement coordinates？
[ ] 前端缩放是否不影响正式 distance？
[ ] 异常帧是否 INVALID，而不是错误 A/B？
[ ] 温度曲线是否只使用 OK / INTERPOLATED 点？
[ ] 是否通过 dataset id 调用 golden_a_20260522_dev_lab / golden_c_20260529_dev_lab？
[ ] 是否避免在源码中硬编码本机绝对路径？
[ ] 是否更新 problem.md？
[ ] 如果修了问题，是否进行了真实浏览器复测？
[ ] 是否记录了复测证据？
```
