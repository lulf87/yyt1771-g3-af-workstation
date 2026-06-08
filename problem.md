# problem.md — G3 问题登记与解决状态追踪

本文件用于记录 G3 开发过程中遇到的所有问题、风险、bug、未确认需求、复测状态和解决结果。

> 规则：发现问题必须登记；代码修复后必须标记为 `FIXED_PENDING_BROWSER_RETEST`；只有真实浏览器复测通过后，才能标记为 `RESOLVED_BROWSER_VERIFIED`。

---

## 1. 状态定义

| 状态 | 含义 |
|---|---|
| OPEN | 已发现，未开始处理 |
| IN_PROGRESS | 正在处理 |
| FIXED_PENDING_BROWSER_RETEST | 代码层面已修复，等待真实浏览器复测 |
| RESOLVED_BROWSER_VERIFIED | 已通过真实浏览器复测，可以关闭 |
| REOPENED | 复测失败或问题复现，重新打开 |
| BLOCKED | 被硬件、数据、需求或环境阻塞 |
| WONTFIX | 明确决定不修，必须写清原因 |

---

## 2. 问题总览表

| ID | 状态 | 优先级 | 模块 | 标题 | 发现日期 | 最近更新 | 负责人/工具 | 复测要求 |
|---|---|---:|---|---|---|---|---|---|
| P-0001 | RESOLVED_BROWSER_VERIFIED | P0 | vision / envelope | 待测物体整体外包络识别必须稳定，不能依赖内部纹理或简单凸包 | 2026-06-03 | 2026-06-04 | Codex | Offline playback + 浏览器 overlay 复测已通过 |
| P-0002 | RESOLVED_BROWSER_VERIFIED | P0 | vision / AB tracking | 多个候选宽度接近时 A/B 点可能在不同位置跳动 | 2026-06-03 | 2026-06-04 | Codex | Live offline run 浏览器复测已通过 |
| P-0003 | RESOLVED_BROWSER_VERIFIED | P0 | BundleEnvelopeDetector | C 类多细支必须作为整体外包络，不能测单根线或内部缝隙 | 2026-06-03 | 2026-06-04 | Codex | C 类数据集浏览器 overlay / run 复测已通过 |
| P-0004 | RESOLVED_BROWSER_VERIFIED | P0 | frontend / ROI / coordinates | 浏览器缩放、预览 downsample 和 rotated ROI 映射不得影响正式 distance_px | 2026-06-03 | 2026-06-04 | Codex | 窗口变化 + 125% 页面 zoom 复测已通过 |
| P-0005 | RESOLVED_BROWSER_VERIFIED | P1 | temperature / analysis | 温度同步 >10ms 时需保留 A/B，但 Af 曲线只使用 OK/INTERPOLATED 点 | 2026-06-03 | 2026-06-04 | Codex | 曲线和导出复测已通过 |
| P-0006 | RESOLVED_BROWSER_VERIFIED | P1 | camera | Hik MVS SDK 必须 lazy import，无相机环境也能运行 offline/playback | 2026-06-03 | 2026-06-06 | Codex | 无 SDK / 无相机 offline fallback 浏览器复测已通过；真实硬件见 P-0020 |
| P-0007 | RESOLVED_BROWSER_VERIFIED | P1 | dataset registry / offline playback | 本地离线素材路径、manifest、temperature.csv、frames 需要验证可访问 | 2026-06-03 | 2026-06-03 | Codex | Playback / Setup 真实浏览器复测已通过 |
| P-0008 | RESOLVED_BROWSER_VERIFIED | P1 | repository skeleton | Milestone 1 新仓库骨架需验收并标注完成 | 2026-06-03 | 2026-06-03 | Codex | 结构测试、import/build、浏览器 smoke 已通过 |
| P-0009 | RESOLVED_BROWSER_VERIFIED | P0 | frontend / ROI editor | ROI 框选必须完全支持鼠标移动、缩放和旋转 | 2026-06-04 | 2026-06-04 | Codex | Setup 鼠标 ROI 编辑 + probe 浏览器复测已通过 |
| P-0010 | RESOLVED_BROWSER_VERIFIED | P0 | frontend / live offline run | Offline run 必须实时显示图像、实时曲线并支持全帧运行 | 2026-06-04 | 2026-06-04 | Codex | A/C 全帧 run 逻辑 + 浏览器实时流程复测已通过 |
| P-0011 | RESOLVED_BROWSER_VERIFIED | P1 | backend / live offline run performance | C 类全帧 run 从第 1 帧完整运行耗时过长，低于 5-10 fps 目标 | 2026-06-04 | 2026-06-06 | Codex | C 类全帧浏览器 run 8623/8623，6.874 fps，复测已通过 |
| P-0012 | RESOLVED_BROWSER_VERIFIED | P0 | vision / setup / run overlay | Setup 和 Run 必须改用归档轮廓检测方案并显示投影 L/轮廓 overlay | 2026-06-04 | 2026-06-04 | Codex | A/C Setup probe + Run 浏览器复测已通过 |
| P-0013 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / run curves / analysis | 实时试验曲线应只显示 temperature 和 distance，并补齐纵横坐标轴 | 2026-06-04 | 2026-06-04 | Codex | Run + Analysis 真实浏览器复测已通过 |
| P-0014 | RESOLVED_BROWSER_VERIFIED | P0 | vision / setup / run detector | A/C 轮廓检测必须分别对齐归档网格类和线束类方案 | 2026-06-04 | 2026-06-04 | Codex | A/C Setup probe + Run 浏览器复测已通过 |
| P-0015 | RESOLVED_BROWSER_VERIFIED | P0 | vision / ROI validity / BalloonEnvelopeDetector | A 类 20260522 截断 ROI 下 distance 断崖仍被标为 VALID | 2026-06-04 | 2026-06-05 | Codex | 同 ROI Playback 1000/1500/1543 + Run 1450-1553 浏览器复测已通过 |
| P-0016 | RESOLVED_BROWSER_VERIFIED | P0 | vision / BalloonEnvelopeDetector | A 类气泡/低对比斑点会通过跨行边界拼接放大 distance | 2026-06-04 | 2026-06-04 | Codex | 600/660/690/730 同 ROI Setup probe + 600-730 Run 浏览器复测已通过 |
| P-0017 | RESOLVED_BROWSER_VERIFIED | P0 | frontend / live offline run / frame display | C 类全帧 Run 时底图可能变黑，只剩 overlay 和曲线继续更新 | 2026-06-05 | 2026-06-05 | Codex | C 类 Run 页面真实浏览器复测已通过 |
| P-0018 | RESOLVED_BROWSER_VERIFIED | P0 | analysis / run / setup / temperature control | Run/Analysis 应以 distance-temperature 和 AFAS As/Af 后处理为主，并补温控显示/设置 | 2026-06-05 | 2026-06-05 | Codex | Setup + Run + Analysis 浏览器复测已通过 |
| P-0019 | RESOLVED_BROWSER_VERIFIED | P1 | backend / CORS / dev server | Vite 自动回退到 5177 时 backend CORS 未放行导致前端 Failed to fetch | 2026-06-05 | 2026-06-05 | Codex | Run 页面浏览器复测已通过 |
| P-0020 | BLOCKED | P0 | camera / temperature / real run | G3 真实相机 + LU92XX 温控链路需接入并等待真实硬件复测 | 2026-06-05 | 2026-06-08 | Codex | 真实 Hik 相机 Setup→Run 完整浏览器复测 PASS；Setup 温控 unavailable 显示已复测；LU92XX `/dev/cu.usbserial-1210` 缺失，完整温控链路仍阻塞 |
| P-0021 | RESOLVED_BROWSER_VERIFIED | P1 | backend / real camera run / temperature fallback | 本地 LU92XX 串口配置存在但未连接时会盖过相机 SDK 缺失错误 | 2026-06-05 | 2026-06-06 | Codex | no-hardware 浏览器 fallback 复测已通过；真实硬件见 P-0020 |
| P-0022 | RESOLVED_BROWSER_VERIFIED | P0 | run curves / AFAS preprocessing | Run 实时 temperature-distance 曲线仍使用原始点，未采用 starter 平滑预处理 | 2026-06-06 | 2026-06-06 | Codex | A 类 Run + Analysis 真实浏览器复测已通过 |
| P-0023 | RESOLVED_BROWSER_VERIFIED | P2 | frontend / live offline run stop | 手动 Stop 后等待 partial run 落盘期间会产生短暂 404 网络日志 | 2026-06-06 | 2026-06-06 | Codex | Stop partial run 浏览器复测已通过，无 `/api/runs/{id}` 404 |
| P-0024 | RESOLVED_BROWSER_VERIFIED | P0 | vision / BalloonEnvelopeDetector / speck rejection | A 类 3804 帧 ROI 内游离脏点被纳入 mesh_region 并决定外包络 max-width | 2026-06-06 | 2026-06-06 | Codex | Playback 3800/3804 + Run 3804 目标温度停止浏览器复测已通过 |
| P-0025 | RESOLVED_BROWSER_VERIFIED | P2 | frontend / live offline run / browser retest | 未设置目标温度的长时间 Run stream 在 Playwright 复测中可导致 target crashed | 2026-06-06 | 2026-06-06 | Codex | A/C 无目标温度浏览器全帧 stream 已完成且未崩溃 |
| P-0026 | RESOLVED_BROWSER_VERIFIED | P0 | analysis / AFAS UI / tangent overlay | Analysis 页缺少平滑参数、As/Af 参数设置和切线/基线可视化 | 2026-06-06 | 2026-06-06 | Codex | A 类 Run + Analysis 参数重算 + 切线 overlay 浏览器复测已通过 |
| P-0027 | RESOLVED_BROWSER_VERIFIED | P0 | vision / BundleEnvelopeDetector / C curve stability | C 类给定 ROI 下 2614/2615 相邻帧 distance 大跳并导致 2-3°C 曲线波动 | 2026-06-06 | 2026-06-06 | Codex | C 类 Playback 2614/2615 + Run 曲线浏览器复测已通过 |
| P-0028 | RESOLVED_BROWSER_VERIFIED | P1 | analysis / AFAS / live offline stream | 短 Run 结束保存 analysis 时 AFAS baseline 点数不足会导致 stream network error | 2026-06-06 | 2026-06-06 | Codex | C 类 Run 目标温度停止浏览器复测已通过 |
| P-0029 | RESOLVED_BROWSER_VERIFIED | P1 | local env / archived scripts | 系统 Python 的 OpenCV wheel 与 NumPy 2.x ABI 不兼容，归档脚本无法 import cv2 | 2026-06-06 | 2026-06-06 | Codex | 环境类问题，浏览器复测不适用；cv2 导入和归档脚本合成图运行已通过 |
| P-0030 | RESOLVED_BROWSER_VERIFIED | P0 | vision / live offline run / detector audit | A/C 图示 ROI 需采用归档前处理 + G3 稳定支撑列/同窗口 A/B 规则并全帧浏览器审计 | 2026-06-06 | 2026-06-06 | Codex | A/C 图示 ROI 真实浏览器全帧 run + manifest 审计已通过 |
| P-0031 | OPEN | P1 | vision / setup overlay / archive comparison | A 类 Setup 诊断框与归档 closed contour 显示口径不同，ROI 角度变化时容易误解为轮廓未包全 | 2026-06-06 | 2026-06-06 | Codex | 待确认是否增加 outer_contour / filled_contour overlay 或调整说明 |
| P-0032 | OPEN | P1 | vision / archive comparison / curve stability | A 类当前 ROI 下归档网格类跨 row 宽度也会产生尖峰，不宜直接替换 G3 正式 distance | 2026-06-06 | 2026-06-08 | Codex | 待确认是否仅作为诊断或引入额外稳定约束 |
| P-0038 | OPEN | P1 | run curves / realtime AF | Run 结束时缺少独立实时结果链 As/Af/AF95，与 Analysis AFAS 后处理未形成两套分析 | 2026-06-07 | 2026-06-07 | Codex | 待实现后用 A/C Run + Analysis 浏览器复测 |
| P-0039 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / Run trend chart | Run 页实时 temperature-distance 曲线过小且缺少监护式状态分层 | 2026-06-07 | 2026-06-07 | Codex | golden A Run 页真实浏览器复测已通过 |
| P-0040 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / Analysis AFAS chart | Analysis / Export 页 AFAS 曲线过小且 raw/smoothed/baseline/tangent/markers 视觉权重未分层 | 2026-06-07 | 2026-06-07 | Codex | golden A Analysis/Export 真实浏览器复测已通过 |
| P-0041 | RESOLVED_BROWSER_VERIFIED | P0 | camera / Hik MVS runtime | G3 未复用 starter 的 MVS runtime bootstrap，真机连接后仍无法加载 SDK binding | 2026-06-07 | 2026-06-07 | Codex | 真实 Hik 相机 Preview/Run 浏览器复测已通过 |
| P-0042 | RESOLVED_BROWSER_VERIFIED | P0 | frontend / real camera run frame display | Real Camera Run 后帧画布仍显示当前离线 dataset frame，真实 run 底图来源不一致 | 2026-06-07 | 2026-06-07 | Codex | 真实 Hik 相机 Run 画布使用 run raw frame，浏览器复测已通过 |
| P-0043 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / shared curve view | Run/Analysis 曲线需要共享 variant 化底层 CurveView 并保持工业曲线层级 | 2026-06-07 | 2026-06-07 | Codex | golden A Run + Analysis 浏览器复测已通过 |
| P-0044 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / Run and Analysis curves | Run/Analysis 曲线不应把重复温度 raw frame 点按帧顺序连成正式折线 | 2026-06-07 | 2026-06-07 | Codex | golden A Run + Analysis 浏览器复测已通过 |
| P-0045 | RESOLVED_BROWSER_VERIFIED | P0 | frontend / Setup source / camera preview | Setup 页面需要统一 Source 入口并自动显示真实相机 preview | 2026-06-07 | 2026-06-08 | Codex | 真实 Hik 相机 Setup Live/Freeze/ROI/参数刷新/温控 no-refresh/formal Run measurement_definition 浏览器复测通过；LU92XX 完整闭环仍由 P-0020 跟踪 |
| P-0046 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / Run trend y-axis | Run Live Trend Y 轴按 latest window 局部 min/max 自动缩放，放大 1 px 检测抖动 | 2026-06-07 | 2026-06-08 | Codex | golden A Run 页 sticky y-axis 浏览器复测已通过 |
| P-0047 | OPEN | P1 | frontend / live offline run stop | Playwright 复测中点击 Stop 后 Run 页面仍显示 Running | 2026-06-08 | 2026-06-08 | Codex | 待单独复现并修复后做 Stop partial run 浏览器复测 |
| P-0048 | RESOLVED_BROWSER_VERIFIED | P0 | frontend / API client / probe | Offline Probe 请求把前端 setup source 字段发给 backend，导致 422 extra_forbidden | 2026-06-08 | 2026-06-08 | Codex | golden A Setup Probe current frame 浏览器复测已通过 |
| P-0049 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / Run and Analysis curves | Run/Analysis temperature-distance X 轴不应使用 Latest window 或局部温度窗口 | 2026-06-08 | 2026-06-08 | Codex | golden A Run + Analysis 浏览器复测已通过 |
| P-0050 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / Run and Analysis y-axis | Run/Analysis temperature-distance Y 轴需兼顾完整范围、最小细节跨度和 outlier 抑制 | 2026-06-08 | 2026-06-08 | Codex | golden A Run + Analysis Y 轴浏览器复测已通过 |
| P-0051 | OPEN | P0 | vision / BalloonEnvelopeDetector / speck rejection | A 类 1461 帧右侧小黑点经前处理连入主体后扩大正式外包络 | 2026-06-08 | 2026-06-08 | Codex | 待修复后用 Playback 1400/1460/1461 + Run 浏览器复测 |
| P-0052 | RESOLVED_BROWSER_VERIFIED | P1 | frontend / Analysis AFAS chart | Analysis 默认隐藏 raw 灰点并为 As/Af-tan 增加弱化构造线 | 2026-06-08 | 2026-06-08 | Codex | golden A Analysis/Export 浏览器复测已通过 |

---

## 3. 问题详情

### P-0001 — 待测物体整体外包络识别必须稳定，不能依赖内部纹理或简单凸包

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision`, `BalloonEnvelopeDetector`, `BundleEnvelopeDetector`
- Found date: 2026-06-03
- Last update: 2026-06-04

#### Problem

G3 的首要目标是稳定识别 ROI 内待测物体整体外包络。当前需求明确：A/B 只能来自整体外包络；内部缝隙、暗线、纹理、交叉线、单根细支边界不能作为正式 A/B。

如果外包络识别不稳定，后续 A/B 点和 distance 曲线都会不可靠。

#### Expected

```text
A 类：网眼内部空白应视为内部结构，外包络沿网状主体外侧形成连续边界。
A 类正式测宽应采用暗线增强、主体连通域和稳定行窗口/测量轴窗口左右外包络提取；内部网眼、暗线、交叉线不作为正式边界。
A 类夹子、连接丝、支撑丝、窄尾不得决定 max-width。
C 类：多细支整体视为一个目标，相邻细支间白色间隙视为目标内部。
外部 speck 不能被识别成待测物体。
```

#### Resolution log

- 2026-06-03: 初始登记，待实现 detector 和 regression。
- 2026-06-04: 根据用户确认和 `/Users/lulingfeng/Documents/工作/开发/LuLinFeng/mesh_width_measure.py` 参考实现，将 A 类策略细化为轻量 outer-envelope 测宽：暗线增强、滞后阈值、主体连通域、稳定行窗口/测量轴窗口左右外包络；outer_contour_debug / filled_contour_debug 仅作诊断或 fallback，不作为正式 distance_px 唯一来源。当前仍待实现和浏览器复测，状态保持 OPEN。
- 2026-06-04: 实现 `BalloonEnvelopeDetector` / `BundleEnvelopeDetector` 原型、synthetic envelope regression、golden keyframe smoke、Setup/Playback overlay probe、Live offline run 和 Export 浏览器流程。A/C detector 均通过 dataset id 调用，不硬编码本机路径。

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Setup / Playback / Run / Analysis Export
- Steps: Probe A/C first/last frames with measurement ROI; run live offline sequence; inspect A/B overlay and exported artifacts.
- Expected: A/B comes from whole envelope max-width; detector returns VALID or explicit INVALID; exported CSV/JSON/PNG/overlay preserve backend result.
- Actual: A/C probe and run returned backend DetectionResult with overlay; exports generated CSV/JSON/PNG/overlay/parameters artifacts.
- Result: PASS
- Evidence: `output/playwright/m3_playback_probe_golden_c_last.png`, `output/playwright/m7_live_offline_run_golden_a.png`, `output/playwright/m9_export_golden_a_artifacts.png`, `output/playwright/m9_export_golden_c_artifacts.png`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0002 — 多个候选宽度接近时 A/B 点可能在不同位置跳动

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `vision`, `services/live_offline_run`, `analysis`
- Found date: 2026-06-03
- Last update: 2026-06-04

#### Problem

当多个候选测量轴宽度相同或非常接近时，如果每帧只选绝对最大值，A/B 可能在不同位置之间跳动，导致 overlay 不稳定，甚至影响曲线解释。

#### Expected

```text
保存 raw_best_candidate 和 selected_candidate。
宽度近似等价时，优先选择离上一帧 selected_candidate 最近的候选。
只有明显更优或连续 N 帧更优，才允许切换。
错误候选应被 rejected，不进入正式 distance 曲线。
```

#### Resolution log

- 2026-06-03: 初始登记，待实现 tie-break 和 tracking 稳定策略。
- 2026-06-04: 实现 `vision.stability.select_stable_candidate()`，覆盖宽度近似等价沿用上一帧、连续 N 帧更优才切换、明显更优立即切换、大跳变低置信度 INVALID。Live offline run 将 selection state 逐帧传递。

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Run
- Steps: Start live offline run for A and C datasets; verify run manifest and curve point counts; quantify latest C run distance jumps.
- Expected: selected_candidate is stable across near-tie candidates; run saves raw_best/selected and rejected reasons; no large spurious A/B jump.
- Actual: A/C live offline run saved 160 detections each; C latest 160-frame run distance range was approximately 363.58-365.00px with maximum adjacent jump 1.0px.
- Result: PASS
- Evidence: `output/playwright/m7_live_offline_run_golden_a.png`, `output/playwright/m9_export_golden_c_artifacts.png`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0003 — C 类多细支必须作为整体外包络，不能测单根线或内部缝隙

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `BundleEnvelopeDetector`
- Found date: 2026-06-03
- Last update: 2026-06-04

#### Problem

C 类对象由多根细支组成，测试过程中细支会逐渐松开。系统必须将多根细支作为一个整体目标，持续测量整体外包络最大宽度。不得测单根线宽，不得把内部缝隙或暗线当作边界。

#### Expected

```text
多根细支 = 一个整体目标。
相邻细支之间的空白 = 目标内部。
正式 A/B = 整体外包络最大宽度处两个外侧接触点。
```

#### Resolution log

- 2026-06-03: 初始登记，待实现 BundleEnvelopeDetector。
- 2026-06-04: 实现 BundleEnvelopeDetector 原型，synthetic 多细支整体 fixture 验证不测单根细支宽度；golden C first/last keyframe smoke 均返回 VALID；Run/Export 浏览器流程通过。

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Playback / Run / Analysis Export
- Steps: Probe C dataset frames; start live offline run; export CSV/JSON/PNG/overlay/parameters.
- Expected: C class uses `BundleEnvelopeDetector`, `max_width`, whole bundle envelope, not single strand width.
- Actual: C probe/run used `BundleEnvelopeDetector`; run saved 160 detections and export artifacts.
- Result: PASS
- Evidence: `output/playwright/m3_playback_probe_golden_c_last.png`, `output/playwright/m9_export_golden_c_artifacts.png`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0004 — 浏览器缩放、预览 downsample 和 rotated ROI 映射不得影响正式 distance_px

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `frontend/src/geometry`, `frontend/src/pages/Setup`, `backend/core/roi`
- Found date: 2026-06-03
- Last update: 2026-06-04

#### Problem

用户只关心温度-形变趋势，但系统必须保证用于计算 distance_px 的坐标体系稳定。如果直接使用浏览器显示坐标，窗口大小、缩放比例、downsample 都可能影响正式结果。

#### Expected

```text
正式测量使用统一 measurement coordinates。
默认 measurement coordinates = 原始图像 pixel 坐标。
前端显示可以缩放，但正式 ROI、A/B、distance 不受缩放影响。
同一数据同一 ROI 参数，不同浏览器缩放比例下 distance_px 必须一致。
```

#### Resolution log

- 2026-06-03: 初始登记，待实现坐标映射和浏览器缩放复测。
- 2026-06-04: 实现 backend/frontend measurement/display coordinate mapping、rotated ROI editor、probe API。正式 ROI 始终以 `source_pixel` measurement coordinates 提交到 backend。

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Playback
- Steps: Probe C last frame at normal view; resize browser viewport; repeat probe; set page zoom to 125%; repeat probe.
- Expected: Same measurement ROI returns identical formal distance_px independent of display scale.
- Actual: Formal distance remained `366.00 px` across normal, resized, and 125% zoom checks.
- Result: PASS
- Evidence: `output/playwright/m3_playback_probe_golden_c_last.png`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0005 — 温度同步 >10ms 时需保留 A/B，但 Af 曲线只使用 OK/INTERPOLATED 点

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `temperature`, `analysis`, `export`
- Found date: 2026-06-03
- Last update: 2026-06-04

#### Problem

离线 manifest 中温度可能不是每帧采样，部分帧复用旧温度。需求要求图像帧和温度同步目标 <=10ms；若超出，A/B 检测结果仍保存，但 Af 曲线只使用 TEMP_SYNC_OK 或 TEMP_SYNC_INTERPOLATED 点。

#### Expected

```text
每帧保存 frame_timestamp_ms、temperature_timestamp_ms、temperature_delta_ms、temperature_sync_status。
TEMP_SYNC_STALE / TEMP_SYNC_MISSING 不进入正式 temperature-distance / Af 曲线。
导出 CSV/JSON 中应保留全部帧和同步状态。
```

#### Resolution log

- 2026-06-03: 初始登记，待实现温度状态和曲线过滤。
- 2026-06-04: 实现 `temperature.sync` OK/INTERPOLATED/STALE/MISSING、`analysis_service` 三类曲线；RunManifest 保留全部 DetectionResult，temperature-distance 仅使用 OK/INTERPOLATED。Export CSV/JSON 保留温度同步字段。

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Run / Analysis Export
- Steps: Run A/C live offline sequence; inspect distance-time, temperature-time, temperature-distance counts; export CSV/JSON/PNG.
- Expected: All frame detections are saved; temperature-distance excludes STALE/MISSING; export includes `temperature_sync_status`.
- Actual: A/C runs saved 160 detections each; formal temperature-distance points were 159; downloaded CSV header included `temperature_sync_status`.
- Result: PASS
- Evidence: `output/playwright/m7_live_offline_run_golden_a.png`, `output/playwright/m9_export_golden_a_artifacts.png`, `output/playwright/m9_export_golden_c_artifacts.png`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0006 — Hik MVS SDK 必须 lazy import，无相机环境也能运行 offline/playback

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `camera`, `services/frame_source`
- Found date: 2026-06-03
- Last update: 2026-06-06

#### Problem

正式相机方向为 Hik MVS / 海康 GigE，但开发阶段允许无相机运行。相机 SDK 不得在 import 阶段导致系统启动失败。

#### Expected

```text
无相机、无 Hik SDK 时，backend 仍可启动。
Offline playback / Live offline run / Re-analysis 可运行。
Real camera preview/run 调用时才加载 SDK。
SDK 缺失时返回清晰错误，不影响其他功能。
```

#### Resolution log

- 2026-06-03: 初始登记，待实现 camera adapter lazy import。
- 2026-06-04: 实现 `camera.hik_mvs_source.HikMvsCameraSource` lazy import；普通 backend import/offline/playback/live offline run 不加载 Hik MVS SDK。`/api/camera/preview` 在 SDK 缺失时返回结构化 503 错误。
- 2026-06-04: 补齐 M8 real camera run 代码路径：新增 `run_real_camera()` 服务保存 `raw_frames/frame_*.npy`、`FrameRecord.camera_meta`、run manifest 和 analysis result；新增 `/api/real-camera-runs`；新增 `/api/camera/preview.png`；前端 Run 页面增加 Real Camera preview/run 入口。代码路径使用 fake SDK / fake camera source 自动化测试验证，真实 Hik 相机硬件仍待补测。

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Not applicable for hardware path in current environment
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Run / Analysis Export
- Steps: Verify backend starts without Hik SDK; run offline A/C workflows; use Run page Real Camera Preview and Run controls; run automated camera preview/run endpoint tests with missing SDK and fake SDK/source.
- Expected: Offline workflows remain available; missing SDK returns clear error; real camera preview/run code paths are covered without import-time SDK loading; real hardware preview/run requires hardware follow-up.
- Actual: Offline A/C Run and Export browser flows passed; Run page Real Camera Preview and Run returned structured 503 errors with `camera_status=unavailable`; A live offline run after those errors still saved 160 detections; automated camera tests covered missing-SDK 503, fake SDK preview PNG, and fake camera source real camera run manifest/raw-frame persistence.
- Result: PASS for P-0006 no-SDK / no-camera fallback scope. Real hardware preview/run verification is tracked separately in P-0020.
- Evidence: `backend/tests/unit/test_camera_lazy_import.py`, `backend/tests/integration/test_camera_api.py`, `backend/tests/integration/test_real_camera_run_service.py`, `output/playwright/m8_real_camera_missing_sdk_run_page.png`, `output/playwright/m8_real_camera_missing_sdk_offline_still_works.png`, `output/playwright/m7_live_offline_run_golden_a.png`

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:4173/`
- Backend URL: `http://127.0.0.1:8031/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps: Run 页面执行 `Read temp`、`Ports`、Real Camera `Preview`、Real Camera `Run`；确认无 SDK / 无相机错误不会影响已有 Live Offline partial run 结果显示。
- Expected: Hik MVS SDK lazy import；无 SDK 时 Preview/Run 返回结构化 503；offline run 结果和 analysis 仍可显示。
- Actual: `/api/camera/preview` 和 `/api/real-camera-runs` 均返回 503，页面显示 `Hik MVS SDK is not available; offline playback and live offline run remain available`；此前 partial offline run 126 帧结果仍显示。
- Result: PASS
- Evidence: `output/playwright/p0021_no_hardware_fallback_retest.png`, `output/playwright/p0021_no_hardware_fallback_eval.json`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0007 — 本地离线素材路径、manifest、temperature.csv、frames 需要验证可访问

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `configs/local/offline_datasets.local.json`, `services/offline_dataset`, `Playback`, `Setup`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Found date: 2026-06-03
- Last update: 2026-06-03

#### Problem

G3 已登记两组真实离线素材，但需要在实际开发机上验证路径是否可访问，并确认每个目录包含：

```text
manifest.json
temperature.csv
frames/frame_*.npy
```

如果路径不可访问、文件缺失、权限不足、manifest 字段不符合 loader 预期，Offline playback、Live offline run 和 detector regression 都会被阻塞。

#### Expected

```text
1. configs/local/offline_datasets.local.json 可被后端读取。
2. golden_a_20260522_dev_lab 可解析到 A 类数据目录。
3. golden_c_20260529_dev_lab 可解析到 C 类数据目录。
4. 两组数据均能读取 first frame / last frame。
5. 两组数据均能读取 manifest.json 和 temperature.csv。
6. Playback / Setup 页面能列出两个 dataset id，并能加载预览帧。
```

#### Resolution log

- 2026-06-03: 初始登记，待 Codex 在实际开发机环境中验证。
- 2026-06-03: 实现 `backend/src/yyt1771_g3/services/offline_dataset.py` 本地 offline dataset registry loader，支持 `list_offline_datasets()`、`resolve_dataset(dataset_id)`、`load_manifest()`、`load_temperature_csv()`、`load_first_frame()`、`load_last_frame()`，路径统一从 `configs/local/offline_datasets.local.json` 读取。
- 2026-06-03: 新增 FastAPI offline dataset API 和 Vite/React Setup、Playback 最小页面；前端只显示 backend/API 结果，不计算正式 A/B、distance 或温度同步结果。
- 2026-06-03: 本地验证结果：`golden_a_20260522_dev_lab` 可读取 5807 帧，manifest `frame_count=5807`，temperature rows 5807，first/last frame shape 均为 `(1364, 2048)`、dtype `uint8`；`golden_c_20260529_dev_lab` 可读取 8623 帧，manifest `frame_count=8623`，temperature rows 8623，first/last frame shape 均为 `(1364, 2048)`、dtype `uint8`。
- 2026-06-03: Milestone 0 audit 补充验证：新增 lazy-load regression，确认 `list_offline_datasets()` / `resolve_dataset()` 不调用 `np.load`，只有显式 `load_frame()` / `load_first_frame()` / `load_last_frame()` 才加载 frame array。

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests -q
npm run build
PYTHONPATH=backend/src python3 - <<'PY'
from yyt1771_g3.services.offline_dataset import load_dataset_registry
registry = load_dataset_registry()
for dataset_id in ["golden_a_20260522_dev_lab", "golden_c_20260529_dev_lab"]:
    resolved = registry.resolve_dataset(dataset_id)
    manifest = registry.load_manifest(dataset_id)
    temperatures = registry.load_temperature_csv(dataset_id)
    first = registry.load_first_frame(dataset_id)
    last = registry.load_last_frame(dataset_id)
    print(dataset_id, resolved.frame_count, manifest.get("frame_count"), len(temperatures), first.array.shape, last.array.shape)
PY
rg -n "/Users/lulingfeng" backend frontend scripts || true
```

#### Browser retest log

- Retest date: 2026-06-03
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8002/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup
- Steps: Open frontend; confirm dataset list contains `golden_a_20260522_dev_lab`; select A dataset; verify Setup metrics and first/last frame previews.
- Expected: Dataset id is listed; object class is `A_BALLOON_ENVELOPE`; detector is `BalloonEnvelopeDetector`; width mode is `max_width`; frame count and temperature rows are 5807; first/last frame images render.
- Actual: Expected values and previews rendered.
- Result: PASS
- Evidence: `output/playwright/p0007_setup_golden_a.png`

- Retest date: 2026-06-03
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8002/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup
- Steps: Select C dataset; verify Setup metrics and first/last frame previews.
- Expected: Dataset id is listed; object class is `C_BUNDLE_ENVELOPE`; detector is `BundleEnvelopeDetector`; width mode is `max_width`; frame count and temperature rows are 8623; first/last frame images render.
- Actual: Expected values and previews rendered.
- Result: PASS
- Evidence: `output/playwright/p0007_setup_golden_c.png`

- Retest date: 2026-06-03
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8002/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Playback
- Steps: Open Playback; select A dataset; switch First and Last frame controls.
- Expected: A first frame index 1 and last frame index 5807 render as PNG previews; shape is `1364 × 2048`; dtype is `uint8`.
- Actual: Expected values and previews rendered.
- Result: PASS
- Evidence: `output/playwright/p0007_playback_golden_a_first.png`, `output/playwright/p0007_playback_golden_a_last.png`

- Retest date: 2026-06-03
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8002/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Playback
- Steps: Open Playback; select C dataset; switch First and Last frame controls.
- Expected: C first frame index 1 and last frame index 8623 render as PNG previews; shape is `1364 × 2048`; dtype is `uint8`.
- Actual: Expected values and previews rendered.
- Result: PASS
- Evidence: `output/playwright/p0007_playback_golden_c_first.png`, `output/playwright/p0007_playback_golden_c_last.png`

- Retest date: 2026-06-03
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8002/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Playback
- Steps: Re-open frontend for Milestone 0 audit; confirm A dataset listed from registry; verify Setup first/last previews; open Playback; switch Last and First frame controls.
- Expected: Dataset id is listed; object class is `A_BALLOON_ENVELOPE`; detector is `BalloonEnvelopeDetector`; width mode is `max_width`; frame count and temperature rows are 5807; first frame index 1 and last frame index 5807 render as PNG previews.
- Actual: Expected values and previews rendered; fresh reload console had no errors or warnings.
- Result: PASS
- Evidence: `output/playwright/p0007_m0_setup_golden_a.png`, `output/playwright/p0007_m0_playback_golden_a_first.png`, `output/playwright/p0007_m0_playback_golden_a_last.png`

- Retest date: 2026-06-03
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8002/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Playback
- Steps: Select C dataset for Milestone 0 audit; verify Setup first/last previews; open Playback; switch First and Last frame controls.
- Expected: Dataset id is listed; object class is `C_BUNDLE_ENVELOPE`; detector is `BundleEnvelopeDetector`; width mode is `max_width`; frame count and temperature rows are 8623; first frame index 1 and last frame index 8623 render as PNG previews.
- Actual: Expected values and previews rendered; fresh reload console had no errors or warnings.
- Result: PASS
- Evidence: `output/playwright/p0007_m0_setup_golden_c.png`, `output/playwright/p0007_m0_playback_golden_c_first.png`, `output/playwright/p0007_m0_playback_golden_c_last.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0008 — Milestone 1 新仓库骨架需验收并标注完成

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `backend`, `frontend`, `docs`, `configs`, `datasets`, `scripts`, `tests`
- Found date: 2026-06-03
- Last update: 2026-06-03
- Owner/tool: Codex

#### Problem

Milestone 1 要求建立 G3 新仓库骨架，并确认以下基础项可用：

```text
backend/src/yyt1771_g3/
frontend/src/
docs/
configs/
datasets/
scripts/
tests/
backend 可 import
frontend 可 install/build 或至少有 package skeleton
docs 完整放置
problem.md 位于根目录
AGENTS.md 位于根目录
```

#### Expected

```text
仓库骨架目录存在且可复查。
backend package 至少可通过 PYTHONPATH import。
frontend package skeleton 可 build。
仓库级 tests 目录存在，并与 backend/tests、frontend/tests 分工清晰。
Milestone 1 完成状态写入 docs/milestones/G3_开发任务拆分_v0.1.md。
```

#### Fix summary

- 2026-06-03: 新增 `tests/test_milestone1_skeleton.py`，覆盖 Milestone 1 目录、关键文档、backend import、frontend package skeleton。
- 2026-06-03: 新增 `tests/README.md`，明确仓库级测试、`backend/tests/`、`frontend/tests/` 的边界。
- 2026-06-03: 将 `backend/src/yyt1771_g3/api/main.py` 本地 CORS dev 端口扩展到 `5175/5176`，用于 Vite 端口漂移时的真实浏览器 smoke。
- 2026-06-03: 在 `docs/milestones/G3_开发任务拆分_v0.1.md` 标注 Milestone 1 当前节点完成。

#### Tests run

```bash
python3 -m pytest tests/test_milestone1_skeleton.py -q
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
PYTHONPATH=backend/src python3 - <<'PY'
import importlib
for module in ["yyt1771_g3", "yyt1771_g3.api.main", "yyt1771_g3.services.offline_dataset"]:
    importlib.import_module(module)
    print(module, "OK")
PY
npm run build
```

#### Browser retest log

- Retest date: 2026-06-03
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8011/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Setup
- Steps: Start backend and Vite dev server; open frontend in browser; verify app shell, Setup / Playback navigation, offline dataset rail, and first/last preview area render.
- Expected: Browser page loads without console errors or warnings; app shell and dataset list render from backend API.
- Actual: Expected page shell and dataset list rendered; browser console had 0 errors and 0 warnings.
- Result: PASS
- Evidence: `output/playwright/p0008_m1_skeleton_smoke.png`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0009 — ROI 框选必须完全支持鼠标移动、缩放和旋转

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `frontend/src/main.tsx`, `frontend/src/geometry`
- Found date: 2026-06-04
- Last update: 2026-06-04
- Owner/tool: Codex

#### Problem

G3 需求要求操作者在图像上框选 rotated ROI，且前端拖拽出的 ROI 必须映射到 measurement coordinates。当前 UI 只能用鼠标拖动 ROI 中心，ROI 大小和角度主要依赖数字输入，不能完整满足现场操作“完全由鼠标完成框选、调大小、调角度”的要求。

#### Expected

```text
Setup / Playback 图像上可用鼠标完成：
1. 拖动 ROI 整体移动。
2. 拖动边角或边缘手柄调整 ROI width / height。
3. 拖动旋转手柄调整 ROI angle_deg。
4. 所有鼠标操作结果都回写 measurement coordinates。
5. 前端缩放、窗口变化不影响正式 measurement ROI。
6. 修改 ROI 后可直接 probe 当前帧并显示后端 A/B overlay。
```

#### Resolution log

- 2026-06-04: 初始登记，待实现鼠标 resize / rotate handles 并做真实浏览器复测。
- 2026-06-04: 新增 `frontend/src/geometry/roiInteraction.ts`，用 measurement coordinates 实现 ROI 鼠标移动、resize、rotate 几何逻辑；新增 `frontend/tests/roiInteraction.test.ts` 覆盖 move / corner resize / rotated resize / rotate。`FrameCanvas` 增加中心移动手柄、四边/四角 resize 手柄和旋转手柄，所有鼠标结果回写 measurement ROI，并可直接 probe 后端检测。

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Setup
- Steps: Use mouse to drag ROI move handle, drag resize handle, drag rotate handle, then click `Probe current frame`.
- Expected: Center X/Y, Width/Height, and Angle all change from mouse interaction; probe uses updated measurement ROI and returns backend result with A/B overlay.
- Actual: A dataset mouse edit changed ROI to Center X `1255.65`, Center Y `798.42`, Width `1400.43`, Height `448.44`, Angle `42.81`, probe returned `VALID`; C dataset mouse edit changed ROI to Center X `1180.7`, Center Y `887.43`, Width `1487.59`, Height `448.44`, Angle `19.88`, probe returned `VALID`.
- Result: PASS
- Evidence: `output/playwright/m3_roi_mouse_resize_rotate_golden_a.png`, `output/playwright/m3_roi_mouse_resize_rotate_golden_c.png`

#### Final status

RESOLVED_BROWSER_VERIFIED

---

### P-0010 — Offline run 必须实时显示图像、实时曲线并支持全帧运行

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `frontend/src/main.tsx`, `frontend/src/api/client.ts`, `backend/src/yyt1771_g3/services/live_offline_run_service.py`, `backend/src/yyt1771_g3/api/main.py`
- Found date: 2026-06-04
- Last update: 2026-06-04
- Owner/tool: Codex

#### Problem

当前 Run 页面 `Start live offline run` 是后端批处理完成后一次性返回，前端只在结束后显示结果；运行过程中没有实时图像、没有实时 temperature / distance 曲线。前端还按 `max_frames_per_run=160` 发起 run，导致两组 offline 素材无法默认跑完整帧。

#### Expected

```text
1. Live offline run 运行过程中显示当前处理帧图像和 A/B overlay。
2. 运行过程中实时更新 distance-time、temperature-time、temperature-distance 曲线。
3. 默认运行当前素材从 start_frame 到最后一帧，而不是只跑 160 帧。
4. A/C 两个 golden dataset 均可按 dataset id 跑全帧。
5. 仍由 backend detector 输出正式 A/B、distance、temperature sync；frontend 只负责显示。
```

#### Resolution log

- 2026-06-04: 初始登记，待实现 streaming live offline run 和全帧运行。
- 2026-06-04: 修正 `run_live_offline_dataset()` 帧窗口语义：显式 `max_frames` 不再被 `detector_config.max_frames_per_run` 截断；未传 `max_frames` 时默认从 `start_frame` 跑到 dataset 最后一帧。
- 2026-06-04: 新增 `/api/live-offline-runs/stream` NDJSON 流式端点；每帧由 backend 输出 `DetectionResult`、`FrameRecord`、`TemperatureRecord` 和 backend 计算的 `curve_points`，完成后保存 `run_manifest.json` / `analysis_result.json`。
- 2026-06-04: 前端 Run 页面接入 stream：运行中/完成后显示当前帧图像、只读 ROI、A/B overlay、实时 progress、distance、temperature、sync、distance-time / temperature-time / temperature-distance 曲线，并提供 Stop 按钮。
- 2026-06-04: 发现 C 类从第 1 帧完整 run 耗时明显偏长，另登记 P-0011 性能风险；P-0010 的实时显示、全帧语义和保存逻辑已通过验证。

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_live_offline_run_service.py::test_live_offline_run_honors_explicit_frame_request_beyond_config_cap backend/tests/integration/test_live_offline_run_service.py::test_live_offline_run_defaults_to_remaining_dataset_frames backend/tests/integration/test_live_offline_run_api.py::test_live_offline_run_stream_api_emits_frame_events_and_final_run -q
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
npm run build
```

#### Full-frame verification

- Date: 2026-06-04
- Method: backend service full run by dataset id with `max_frames=None`, writing derived outputs under `output/runs/`.
- Dataset: `golden_a_20260522_dev_lab`
- Run ID: `run-golden_a_20260522_dev_lab-20260604T071928175079Z`
- Expected frames: 5807
- Actual frame_records: 5807
- Actual detection_results: 5807
- Valid detections: 5806
- Distance-time points: 5806
- Temperature-time points: 5807
- Temperature-distance points: 5804
- Elapsed: 1044.77 s
- Evidence: `output/runs/run-golden_a_20260522_dev_lab-20260604T071928175079Z/run_manifest.json`, `output/runs/run-golden_a_20260522_dev_lab-20260604T071928175079Z/analysis_result.json`

- Dataset: `golden_c_20260529_dev_lab`
- Run ID: `run-golden_c_20260529_dev_lab-20260604T073652969480Z`
- Expected frames: 8623
- Actual frame_records: 8623
- Actual detection_results: 8623
- Valid detections: 8622
- Distance-time points: 8622
- Temperature-time points: 8623
- Temperature-distance points: 8621
- Elapsed: 3382.48 s
- Evidence: `output/runs/run-golden_c_20260529_dev_lab-20260604T073652969480Z/run_manifest.json`, `output/runs/run-golden_c_20260529_dev_lab-20260604T073652969480Z/analysis_result.json`

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps: Select A dataset; set Setup frame to 5750; open Run; confirm frame budget 58; click `Start full offline run`; verify current image, ROI, A/B overlay, progress, distance, temperature, sync, and three curves render; confirm final run saved 58 frames.
- Expected: Stream updates Run page and default run processes remaining frames to 5807.
- Actual: Run saved 58 frame_records / 58 detection_results; page showed live frame 5807, A/B overlay, distance-time / temperature-time / temperature-distance curves.
- Result: PASS
- Evidence: `output/playwright/p0010_run_realtime_golden_a.png`, `output/runs/run-golden_a_20260522_dev_lab-20260604T084125910240Z/run_manifest.json`

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Run
- Steps: Select C dataset; set Setup frame to 8580; open Run; confirm frame budget 44; click `Start full offline run`; verify current image, ROI, A/B overlay, progress, distance, temperature, sync, and three curves render; confirm final run saved 44 frames.
- Expected: Stream updates Run page and default run processes remaining frames to 8623.
- Actual: Run saved 44 frame_records / 44 detection_results; page showed live frame 8623, A/B overlay, distance-time / temperature-time / temperature-distance curves.
- Result: PASS
- Evidence: `output/playwright/p0010_run_realtime_golden_c.png`, `output/runs/run-golden_c_20260529_dev_lab-20260604T084407460044Z/run_manifest.json`

- Console check: after fresh reload on 2026-06-04, Playwright console query returned 0 new errors and 0 new warnings.

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0011 — C 类全帧 run 从第 1 帧完整运行耗时过长，低于 5-10 fps 目标

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `backend/src/yyt1771_g3/vision`, `backend/src/yyt1771_g3/services/live_offline_run_service.py`, `frontend/src/main.tsx`
- Found date: 2026-06-04
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

P-0010 全帧验证期间，A/C 两组真实素材均可完整跑完并保存，但 C 类从第 1 帧跑完整 8623 帧耗时 `3382.48 s`，约 `2.55 fps`，低于 Milestone 7 规划的 5-10 fps。A 类 5807 帧耗时 `1044.77 s`，约 `5.56 fps`。

#### Expected

```text
Live offline run 应接近 5-10 fps。
全帧 run 应有可持续的进度反馈，长时间运行不应依赖单个阻塞式前台请求。
```

#### Actual

```text
golden_a_20260522_dev_lab: 5807 frames, 1044.77 s, about 5.56 fps.
golden_c_20260529_dev_lab: 8623 frames, 3382.48 s, about 2.55 fps.
当前 stream 可显示实时进度，但完整 C run 时间过长，后续需要 detector 性能优化或后台任务化。
```

#### Evidence

```text
output/runs/run-golden_a_20260522_dev_lab-20260604T071928175079Z/run_manifest.json
output/runs/run-golden_c_20260529_dev_lab-20260604T073652969480Z/run_manifest.json
```

#### Resolution log

- 2026-06-06: 随 P-0030 detector 审计和前端 stream 稳定性修复后，C 类完整浏览器 run 速度已回到 5-10 fps 目标内。以 run_id 起始时间和 RunManifest `created_at` 完成保存时间计算，最新完整 C run 为 `run-golden_c_20260529_dev_lab-20260606T123948034895Z`，8623/8623 帧，1254.38 s，6.874 fps，`stop_reason=complete`。

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8026/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Run
- Steps: 用图示 ROI 启动 C 类 Live Offline full run，从第 1 帧运行到 dataset 末尾；记录浏览器状态、HTTP 状态、frame count 和 run_id；随后审计 run manifest 的起止时间。
- Expected: C 类全帧 run 完成 8623/8623 帧；无 stream/browser crash；有效速度达到 5-10 fps。
- Actual: `run-golden_c_20260529_dev_lab-20260606T123948034895Z` 完成 8623/8623 帧，HTTP 200，无错误；性能审计为 1254.38 s、6.874 fps。
- Result: PASS
- Evidence: `output/playwright/p0030_browser_full_run_evidence.png`, `output/playwright/p0011_c_full_frame_performance_audit.json`, `output/runs/run-golden_c_20260529_dev_lab-20260606T123948034895Z/run_manifest.json`

#### Final status

RESOLVED_BROWSER_VERIFIED

### P-0026 — Analysis 页缺少平滑参数、As/Af 参数设置和切线/基线可视化

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/services/afas_analysis.py`, `backend/src/yyt1771_g3/api/main.py`, `frontend/src/main.tsx`, `frontend/src/curves.ts`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

用户指出当前 G3 Analysis 页面没有像 `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter` 的 analysis 那样提供平滑设置、As/Af 点相关设置，也没有显示切线。

#### Expected

```text
Analysis 页面应支持 AFAS 后处理参数复核和重算：
1. 平滑/预处理参数可调，包括按温度分组、离群点修复、Savitzky-Golay 窗口和阶数。
2. As/Af-tan 切线分析参数可调，包括低温基线区间、高温基线区间、切线偏移。
3. temperature-distance 曲线显示原始正式点、平滑曲线、低温基线、高温基线、最大斜率切线、As 与 Af-tan 标记。
4. 参数重算由 backend 完成，frontend 不作为正式分析计算源。
```

#### Actual

```text
当前 Analysis 页面只显示 AFAS 结果摘要和 smoothed distance-temperature 曲线。
缺少可编辑分析参数。
缺少切线、基线、As/Af-tan 交点 overlay。
```

#### External references checked

```text
YY/T 1771 公开资料：该标准用于通过弯曲和自由恢复测定镍钛形状记忆合金相变温度，核心业务曲线为温度-变形/位移曲线，As/Af 需要曲线解释。
yyt1771_starter：AFAS 预处理参数包含 group_by_temperature、outlier_window、outlier_threshold、outlier_max_iterations、savgol_window_length、savgol_polyorder；分析参数包含 low_range_celsius、high_range_celsius、tangent_offset。
商业热分析软件公开资料：同类分析软件通常提供自动评价、基线/起止点/切线类工具和报告输出。
Sources checked: 国家数字标准馆 YY/T 1771-2021, ASTM F2082/F2082M, TA Instruments TRIOS, NETZSCH Proteus, Mettler Toledo STARe public materials.
```

#### Fix summary

```text
1. Backend 增加 POST /api/runs/{run_id}/analysis，支持以 AFAS preprocessing / tangent analysis 参数重算并持久化 analysis_result.json。
2. Export 优先读取当前已持久化 analysis_result，避免用户调参后导出回到默认分析。
3. Analysis 页面增加 AFAS Parameters 面板：
   - group_by_temperature
   - outlier_window / outlier_threshold / outlier_max_iterations
   - savgol_window_length / savgol_polyorder
   - low_range_celsius / high_range_celsius
   - tangent_offset
4. 曲线显示 raw formal temperature-distance 点、smoothed 曲线、low baseline、high baseline、tangent、As、Af-tan 和 max-slope 标记。
5. 曲线 tick 和 overlay 线段增加非有限值防护，避免实时 run 中间态或异常 AFAS 拟合导致页面崩溃。
6. Backend AFAS 对重复温度导致的非有限切线/基线拟合输出 unavailable / nonfinite_fit，不再出现 status=ok 但 As/Af 为空的矛盾状态。
```

#### Tests run

```text
npm test
npm run build
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_analysis_service.py::test_afas_analysis_marks_nonfinite_tangent_fit_unavailable backend/tests/unit/test_analysis_service.py::test_analysis_result_accepts_afas_parameter_overrides backend/tests/integration/test_analysis_api.py -q
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
```

Result:

```text
frontend: 6 passed; production build passed.
backend targeted: 3 passed.
backend full: 71 passed.
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5178/`
- Backend URL: `http://127.0.0.1:8024/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run / Analysis / Export
- Steps: 在 Setup 设置 start frame 3900 和 target temperature 10.5 °C；Run live offline 至目标温度停止并落盘 51 帧；进入 Analysis；调整 AFAS 参数为 group_by_temperature=true、savgol_window_length=7、savgol_polyorder=2、tangent_offset=-8；点击 Recalculate；点击 Export。
- Expected: Analysis 显示平滑参数和 As/Af-tan 参数；后端重算并持久化；曲线显示 raw 点、smoothed 曲线、低/高基线、切线、As/Af-tan/max-slope 标记；导出使用当前重算后的 analysis。
- Actual: Analysis 显示 AFAS status ok、As=10.27 °C、Af-tan=10.36 °C、ΔT=0.09 °C、max slope=10.30 °C；参数面板显示 Savgol window=7、polyorder=2、tangent_offset=-8；曲线显示 raw/smoothed/low baseline/high baseline/tangent 图例和对应标记；导出生成 CSV/JSON/PNG/overlay/parameters artifacts。
- Result: PASS
- Evidence: `output/playwright/p0026_analysis_afas_parameters_tangent.png`, `output/runs/run-golden_a_20260522_dev_lab-20260606T080000165972Z/analysis_result.json`, `output/runs/run-golden_a_20260522_dev_lab-20260606T080000165972Z/exports/`

#### Final status

RESOLVED_BROWSER_VERIFIED

### P-0027 — C 类给定 ROI 下 2614/2615 相邻帧 distance 大跳并导致 2-3°C 曲线波动

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision`, `BundleEnvelopeDetector`, `frontend Playback/Run`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

用户在 `golden_c_20260529_dev_lab` 上给出一个 rotated ROI：

```text
center_x = 1062.83
center_y = 650.7
width = 763.35
height = 1020.38
angle_deg = -7.31
```

Playback 显示相邻帧 2614 / 2615 的 C 类 distance 从约 208 px 跳到约 181 px；Run 曲线在 2-3°C 左右出现大幅波动。

#### Expected

```text
C 类多细支 / 多线束应作为整体目标。
同一 ROI 下相邻帧不应因为单根线、局部分叉、短碎片或局部线束簇而切换正式外包络。
如果无法稳定识别整体外包络，应 INVALID，而不是输出看似正常但实际错误的 distance。
```

#### Actual

修复前已复现：

```text
frame 2614: VALID, distance_px = 208.00000000000006
frame 2615: VALID, distance_px = 181.0340000000001
相邻帧差值约 26.97 px
```

#### Investigation log

- 2026-06-06: 初始登记。待用当前 detector 复现 frame 2614/2615，并检查 mask、连通域、projection bounds 和 candidate stability。
- 2026-06-06: 根因确认。C 类 `_wire_projection_candidate` 使用 ROI 内全部 mask 像素的全局 `contour_projection_quantile=0.002` 计算左右边界。frame 2614 中少量 x≈197-203 的左侧短碎片像素足以把左边界拉到 203，导致 length=208；frame 2615 同一碎片数量略变，左边界回到约 230，导致 length=181.034。主体线束与左侧稳定小线束簇在两帧基本一致。
- 2026-06-06: 修复后逐帧扫描 2500-2820：321/321 帧 VALID，distance 范围 179.00000000000006-183.00000000000003，相邻帧最大变化 1.9999999999999147 px，无 >8 px 跳动。2614/2615 均为 181.0000000000001 px；debug 中保留 `wire_global_quantile_length_px` 显示旧全局算法在 2614 仍会得到 208.0。

#### Fix summary

已修复：

```text
1. C 类正式投影改为 stable_support_columns：
   - 先按 x 列统计 mask 纵向支撑度；
   - 对列支撑做平滑；
   - 只保留达到支撑阈值的稳定列；
   - 合并间距在 wire_box_padding_px 内的相邻线束簇；
   - 在选中的稳定支撑组内计算正式左右投影分位数。
2. 新增 C 类真实素材回归测试，固定用户 ROI 验证 2614/2615 不再跳动。
3. debug_artifacts 增加稳定支撑列诊断字段，用于区分正式结果和旧全局分位数结果。
```

#### Tests run

```bash
PYTHONPATH=backend/src pytest -q backend/tests/integration/test_golden_detector_smoke.py::test_golden_c_user_roi_adjacent_frames_keep_stable_bundle_envelope
PYTHONPATH=backend/src pytest -q backend/tests
npm test
npm run build
```

结果：后端 68 passed；前端 6 passed；前端 build passed。

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8025/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Run
- Steps: 选择 C 数据集；设置 ROI 为 center_x=1062.83, center_y=650.7, width=763.35, height=1020.38, angle_deg=-7.31；分别 probe frame 2614 和 2615；随后设置 start frame=2500、target=4.5°C，执行 live offline run。
- Expected: 2614/2615 相邻帧 distance 不应出现 208→181 的突跳；Run temperature-distance 曲线不应出现由碎片列导致的尖峰。
- Actual: Playback/Setup probe 中 2614=181.00 px，2615=181.00 px；Run 从 2500 跑到 2732，共 233 帧，Temp-distance points=233，AFAS status=ok，analysis_result 中 distance 范围为 179.00000000000006-182.6140000000014；曲线未出现 208 px 尖峰。
- Result: PASS
- Evidence: `output/playwright/p0027_playback_frame2614_fixed.png`, `output/playwright/p0027_playback_frame2615_fixed.png`, `output/playwright/p0027_run_c_2500_2732_curve_fixed.png`, `output/playwright/p0027_run_c_2500_2732_curve_area_fixed.png`, `output/runs/run-golden_c_20260529_dev_lab-20260606T092745801557Z/analysis_result.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0028 — 短 Run 结束保存 analysis 时 AFAS baseline 点数不足会导致 stream network error

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `backend/src/yyt1771_g3/services/afas_analysis.py`, `backend/src/yyt1771_g3/services/live_offline_run_service.py`, `frontend Run`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

P-0027 Run 浏览器复测中，短 run 在结束保存 `analysis_result` 时触发 AFAS baseline 拟合异常，前端显示 `network error`。后端栈显示：

```text
ValueError: Need at least 2 points for baseline fitting, got 1
```

#### Expected

```text
AFAS 基线点数不足时，analysis 应返回 result_status=unavailable，而不是让 live offline stream 崩溃。
```

#### Actual

修复前，`build_analysis_result()` 在 `fit_baseline()` 抛出 ValueError 后没有降级处理，导致 `/api/live-offline-runs/stream` 异常结束。

#### Investigation log

- 2026-06-06: 在 P-0027 Run 复测中复现。原因是短 run 的自动高温 baseline 范围内只有 1 个点，`fit_baseline()` 抛出 ValueError。

#### Fix summary

`analyze_preprocessed_afas()` 现在捕获 baseline 拟合的 `ValueError`，返回结构化：

```text
result_status = unavailable
reason = insufficient_baseline_points
result.As = None
result.Af_tan = None
```

保留 series、derivative、tangent 和 baseline range 诊断，避免 Run/Analysis 请求崩溃。

#### Tests run

```bash
PYTHONPATH=backend/src pytest -q backend/tests/unit/test_analysis_service.py::test_afas_analysis_marks_insufficient_baseline_points_unavailable
PYTHONPATH=backend/src pytest -q backend/tests
npm test
```

结果：后端 68 passed；前端 6 passed。

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8025/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Run
- Steps: 使用 P-0027 同一 ROI，start frame=2500，target=4.5°C，执行 live offline run。
- Expected: Run 结束后不出现 stream network error；analysis 可落盘。
- Actual: Run 正常结束，233/233 frames saved，AFAS status=ok，未再出现 network error；`output/runs/run-golden_c_20260529_dev_lab-20260606T092745801557Z/analysis_result.json` 已生成。
- Result: PASS
- Evidence: `output/playwright/p0027_run_c_2500_2732_curve_fixed.png`, `output/playwright/p0027_run_c_2500_2732_curve_area_fixed.png`, `output/runs/run-golden_c_20260529_dev_lab-20260606T092745801557Z/analysis_result.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0012 — Setup 和 Run 必须改用归档轮廓检测方案并显示投影 L/轮廓 overlay

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, `frontend/src/main.tsx`
- Found date: 2026-06-04
- Last update: 2026-06-04
- Owner/tool: Codex

#### Problem

用户确认 Setup 和 Run 状态都应使用 `/Users/lulingfeng/Documents/工作/开发/归档` 中的轮廓检测方案，附件效果为 `stable_contours` 白色轮廓、黄色投影框、红色方向箭头，并显示 `theta` 与 `L`。当前 G3 detector 仍是简化的 ROI 内暗目标垂直窗口测宽，前端 overlay 只显示 ROI 与 A/B 线，没有归档方案中的 contour projection debug。

#### Expected

```text
1. Setup probe 当前帧使用归档轮廓检测思路：暗线增强、滞后阈值、主体 mask、外轮廓/边界点、按 theta 投影得到 L。
2. Run 逐帧检测与 Setup 使用同一套 backend detector。
3. theta 使用 measurement ROI 的 angle_deg。
4. distance_px 使用轮廓点沿 theta 方向的投影长度 L。
5. debug_artifacts 保存 contour_projection_box、direction_arrow、theta、L 等信息。
6. 前端 Setup / Run overlay 显示黄色投影框和红色方向箭头，效果贴近附件。
```

#### Resolution log

- 2026-06-04: 初始登记，待实现和浏览器复测。
- 2026-06-04: 后端 detector 改为归档式稳定轮廓投影：暗线增强、滞后阈值、主体 mask、闭运算/填洞得到外边界点，按 ROI `angle_deg` 方向投影得到 `L`，并将 `distance_px = contour_length_px`。
- 2026-06-04: Setup probe 和 Run stream 均复用 `detect_frame_with_state()`，因此两处使用同一套 `stable_contour_projection` 正式检测结果。
- 2026-06-04: `debug_artifacts` 新增 `contour_measurement_mode`、`contour_theta_deg`、`contour_length_px`、`contour_projection_box`、`contour_direction_arrow`、`stable_contour_point_count`。
- 2026-06-04: 前端 `FrameCanvas` 根据 backend debug artifacts 绘制黄色投影框、红色方向箭头和 `theta/L` 标签，Setup / Run 均可显示，贴近用户附件效果。

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_envelope_detectors.py backend/tests/integration/test_probe_api.py::test_probe_endpoint_detects_current_frame_with_measurement_roi -q
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
npm run build
```

#### Golden detector smoke

```text
golden_a_20260522_dev_lab frame 1: VALID, L=1006.0 px, mode=stable_contour_projection, box=4, arrow=2
golden_a_20260522_dev_lab frame 5807: VALID, L=862.0 px, mode=stable_contour_projection, box=4, arrow=2
golden_c_20260529_dev_lab frame 1: VALID, L=135.58 px, mode=stable_contour_projection, box=4, arrow=2
golden_c_20260529_dev_lab frame 8623: VALID, L=190.0 px, mode=stable_contour_projection, box=4, arrow=2
```

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps: Open Setup; probe A frame 1; verify `theta=0.0 deg L=1006.0px`, yellow projection box and red direction arrow; switch to last frame; open Run; start offline run for one frame; verify Run uses same contour projection overlay.
- Expected: Setup and Run both display contour projection overlay and backend result uses `stable_contour_projection`.
- Actual: Setup A frame 1 displayed `L=1006.0px`; Run A frame 5807 displayed `L=862.0px`; run manifest saved one detection with `contour_measurement_mode=stable_contour_projection`, `box=4`, `arrow=2`.
- Result: PASS
- Evidence: `output/playwright/p0012_setup_contour_probe_golden_a.png`, `output/playwright/p0012_run_contour_golden_a.png`, `output/runs/run-golden_a_20260522_dev_lab-20260604T110732682199Z/run_manifest.json`

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Run
- Steps: Select C dataset; switch to last frame; probe current frame; verify `theta=0.0 deg L=190.0px`, yellow projection box and red direction arrow; open Run; start offline run for one frame; verify Run uses same contour projection overlay.
- Expected: Setup and Run both display contour projection overlay and backend result uses `stable_contour_projection`.
- Actual: Setup C frame 8623 displayed `L=190.0px`; Run C frame 8623 displayed `L=190.0px`; run manifest saved one detection with `contour_measurement_mode=stable_contour_projection`, `box=4`, `arrow=2`.
- Result: PASS
- Evidence: `output/playwright/p0012_setup_contour_probe_golden_c.png`, `output/playwright/p0012_run_contour_golden_c.png`, `output/runs/run-golden_c_20260529_dev_lab-20260604T110454882151Z/run_manifest.json`

- Console check: after fresh reload on 2026-06-04, Playwright console query returned 0 new errors and 0 new warnings.

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0013 — 实时试验曲线应只显示 temperature 和 distance，并补齐纵横坐标轴

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/src/curves.ts`
- Found date: 2026-06-04
- Last update: 2026-06-04
- Owner/tool: Codex

#### Problem

用户反馈当前实时试验曲线不符合目标：实时试验中只需要温度和 distance 曲线，并且曲线需要明确纵横坐标轴指示；数据分析展示方式需要参考 `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter` 中的实现方式。

当前 G3 Run 页面复用三联 `CurveGrid`，实时显示 `distance-time`、`temperature-time`、`temperature-distance` 三张极简 SVG 曲线；曲线没有坐标轴、刻度或单位标签。Analysis 页面也复用同一极简组件，正式 `temperature-distance` 分析图可读性不足。

#### Expected

```text
1. Run / 实时试验页面只显示 distance-time 和 temperature-time 两张实时曲线。
2. 每张曲线都显示横轴、纵轴、刻度和单位标签。
3. 时间序列曲线在有 frame timestamp 时用 elapsed time 显示，避免直接显示 epoch ms。
4. Analysis 页面参考 starter 的图形方式，至少让正式 temperature-distance 曲线具备清晰坐标轴。
5. 前端只负责显示 backend 提供的正式 curve points，不计算正式 A/B、distance、temperature sync 或 Af 结果。
```

#### Actual

```text
Run 页面当前显示三张曲线，并包含实时 temperature-distance。
CurveView 当前只有背景矩形和 polyline，没有坐标轴、刻度或单位标签。
Analysis 页面复用同一极简三联图，可读性不足。
```

#### Fix summary

- 2026-06-04: 阅读 starter 项目中实时过程曲线和 AFAS 分析图实现，确认其图表具备 axis / tick / label，并以 temperature-deformation 分析图为核心。
- 2026-06-04: 新增 `frontend/src/curves.ts`，统一定义 Run 曲线规格、Analysis 曲线规格、elapsed time 归一化、tick 生成和 SVG view model。时间序列曲线在 frame timestamp 可用时显示为 elapsed time 秒，避免直接显示 epoch ms。
- 2026-06-04: Run 页面改为只渲染 `distance_time` 和 `temperature_time` 两张实时曲线；移除实时页面中的 `temperature_distance` 图和 `Temp-distance points` 指标。
- 2026-06-04: Analysis 页面保留正式 `temperature_distance`，并将其作为第一张分析图显示；三张分析图均显示横轴、纵轴、刻度和单位标签。
- 2026-06-04: 前端仍只显示 backend 提供的 `AnalysisResult` / `curve_points`，未改变正式 A/B、distance、temperature sync 或 Af 计算来源。

#### Tests run

```bash
npm test
npm run build
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
```

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run / Analysis
- Steps: Select A dataset; switch Setup to last frame 5807; open Run; start full offline run from frame 5807; inspect Run Result curves at narrow and desktop viewport; open Analysis page.
- Expected: Run page shows only Distance-time and Temperature-time curves; both have x/y axes, ticks and unit labels. Analysis page keeps formal temperature-distance with axes; STALE points do not enter formal temperature-distance.
- Actual: A run saved 1 frame / 1 detection. Run page showed exactly two curves with `Elapsed time (s)`, `Distance (px)` and `Temperature (°C)` axis labels. A frame 5807 was `TEMP_SYNC_STALE`, so Analysis formal temp-distance point count was 0, consistent with temperature sync rules.
- Result: PASS
- Evidence: `output/playwright/p0013_run_two_axis_curves_golden_a.png`, `output/playwright/p0013_run_two_axis_curves_golden_a_desktop.png`

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Run / Analysis
- Steps: Select C dataset; switch Setup to last frame 8623; open Run; start full offline run from frame 8623; inspect Run Result curves; open Analysis page.
- Expected: Run page shows only Distance-time and Temperature-time curves; both have x/y axes, ticks and unit labels. Analysis page shows formal temperature-distance first with Temperature and Distance axes.
- Actual: C run saved 1 frame / 1 detection. Run page showed exactly two curves with axes and units. C frame 8623 was `TEMP_SYNC_INTERPOLATED`, so Analysis formal temp-distance point count was 1 and the first chart displayed `Temperature (°C)` vs `Distance (px)`.
- Result: PASS
- Evidence: `output/playwright/p0013_run_two_axis_curves_golden_c.png`, `output/playwright/p0013_analysis_axis_curves_golden_c.png`

- Console check: after fresh reload on 2026-06-04, Playwright console query returned 0 new errors and 0 new warnings.

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0014 — A/C 轮廓检测必须分别对齐归档网格类和线束类方案

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, Setup probe, Live offline run
- Found date: 2026-06-04
- Last update: 2026-06-04
- Owner/tool: Codex

#### Problem

用户进一步确认 `/Users/lulingfeng/Documents/工作/开发/归档` 中的轮廓检测不是单一通用方案，而是分为 `网格类` 与 `线束类`：

```text
网格类 -> A_BALLOON_ENVELOPE -> BalloonEnvelopeDetector
线束类 -> C_BUNDLE_ENVELOPE -> BundleEnvelopeDetector
```

当前 G3 P-0012 的实现把 A/C 都统一到 `stable_contour_projection`，没有按归档中的 mesh row-envelope 与 wire-bundle projection 分开处理。

#### Expected

```text
1. Setup probe 和 Run 逐帧检测都复用后端正式 detector，不由前端计算 distance。
2. A 类 BalloonEnvelopeDetector 使用归档网格类思路：暗线增强、滞后阈值、主体 mesh_region、稳定行窗口左右外包络测距。
3. C 类 BundleEnvelopeDetector 使用归档线束类思路：线束分割、细长连通域保留、沿 ROI theta 的投影 bounds 测距。
4. 两类结果都继续输出 contour_projection_box / contour_direction_arrow / contour_theta_deg / contour_length_px，供 Setup 和 Run overlay 显示。
```

#### Actual

```text
detect_frame_with_state() 目前没有 A/C 分支。
BalloonEnvelopeDetector 与 BundleEnvelopeDetector 都调用 _detect_envelope_max_width()。
debug_artifacts["contour_measurement_mode"] 统一为 stable_contour_projection。
```

#### Suspected cause

P-0012 只对齐了附件中的投影框/方向箭头显示效果，但没有把归档目录中的网格类和线束类算法差异落实为两个 detector 分支。

#### Fix summary

- 2026-06-04: `detect_frame_with_state()` 按 detector 类型分流：A 类 `BalloonEnvelopeDetector` 调用归档网格类 `archived_mesh_envelope_rows`；C 类 `BundleEnvelopeDetector` 调用归档线束类 `archived_wire_bundle_projection`。
- 2026-06-04: A 类实现暗线增强、滞后阈值、mesh-like 连通域筛选、稳定行窗口 `envelope_rows` 左右外包络测距；正式 distance 使用行窗口左右外包络跨度，并输出 `mesh_envelope_row_count`、`mesh_left/right` 等诊断字段。
- 2026-06-04: C 类实现线束暗线响应分割、细长/面积连通域保留、沿 ROI theta 的 projection bounds；正式 distance 使用 `wire_raw_length_px`，并输出 `wire_point_count`、`wire_width_perpendicular_px` 等诊断字段。
- 2026-06-04: 两类结果均继续输出 `contour_projection_box`、`contour_direction_arrow`、`contour_theta_deg`、`contour_length_px`，Setup 和 Run 前端 overlay 无需计算正式 distance。
- 2026-06-04: 更新 `docs/algorithms/G3_AB检测与外包络算法需求_v0.1.md` 和 `docs/milestones/G3_开发任务拆分_v0.1.md`，将 P-0012 的通用投影记录补正为 P-0014 的 A/C 归档分流记录。

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_envelope_detectors.py -q
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_envelope_detectors.py backend/tests/integration/test_probe_api.py::test_probe_endpoint_detects_current_frame_with_measurement_roi backend/tests/integration/test_golden_detector_smoke.py -q
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
npm test
npm run build
```

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://localhost:5174/`
- Backend URL: `http://127.0.0.1:8022/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps: Open Setup; select A dataset; probe frame 1; inspect diagnostics JSON and overlay; open Run; start live offline run from frame 1; observe live frame overlay and curves; stop run; from the same browser origin execute a 1-frame Run API call for machine-readable confirmation.
- Expected: Setup and Run both use `BalloonEnvelopeDetector` with `contour_measurement_mode=archived_mesh_envelope_rows`; overlay still shows yellow projection box, red direction arrow, `theta/L`; Run uses backend result, not frontend-calculated distance.
- Actual: Setup returned `VALID`, `distance_px=998.04`, `contour_measurement_mode=archived_mesh_envelope_rows`, `mesh_envelope_row_count=186`, box=4, arrow=2. Run page displayed live A overlay and curves; browser-origin 1-frame Run API returned `mode=archived_mesh_envelope_rows`, `run_id=run-golden_a_20260522_dev_lab-20260604T121728753783Z`, `frame_count=1`.
- Result: PASS
- Evidence: `output/playwright/p0014_setup_mesh_archived_golden_a.png`, `output/playwright/p0014_run_mesh_archived_golden_a.png`

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://localhost:5174/`
- Backend URL: `http://127.0.0.1:8022/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Run
- Steps: Select C dataset; probe frame 1; inspect diagnostics JSON and overlay; open Run; start live offline run from frame 1; observe live frame overlay and curves; stop run; from the same browser origin execute a 1-frame Run API call for machine-readable confirmation.
- Expected: Setup and Run both use `BundleEnvelopeDetector` with `contour_measurement_mode=archived_wire_bundle_projection`; overlay still shows yellow projection box, red direction arrow, `theta/L`; Run uses backend result, not frontend-calculated distance.
- Actual: Setup returned `VALID`, `distance_px=190.00`, `contour_measurement_mode=archived_wire_bundle_projection`, `wire_point_count=23209`, `wire_raw_length_px=190`, box=4, arrow=2. Run page displayed live C overlay and curves; browser-origin 1-frame Run API returned `mode=archived_wire_bundle_projection`, `run_id=run-golden_c_20260529_dev_lab-20260604T122226416060Z`, `frame_count=1`.
- Result: PASS
- Evidence: `output/playwright/p0014_setup_wire_archived_golden_c.png`, `output/playwright/p0014_run_wire_archived_golden_c.png`

- Console check: after current 5174/8022 browser flow, Playwright console query returned 0 new errors and 0 new warnings.

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0015 — A 类 20260522 截断 ROI 下 distance 断崖仍被标为 VALID

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, ROI validity, Run curve
- Found date: 2026-06-04
- Last update: 2026-06-05
- Owner/tool: Codex

#### Problem

用户反馈 `golden_a_20260522_dev_lab` 的 Run 曲线在图 1 附近出现约 1000px 到 580px 的大幅断崖。排查保存的 run 后定位到：

```text
Run: output/runs/run-golden_a_20260522_dev_lab-20260604T113644088329Z
ROI: center=(1101.038, 440.321), width=1269.76, height=381.92, angle=-11.855°
Old mode in saved run: stable_contour_projection
First low frame: 1396, distance≈590px
Largest jump back: frame 2235≈556.8px -> frame 2236≈990px
```

用当前 `archived_mesh_envelope_rows` 对同一 ROI、同一帧复算，仍会出现非物理断崖：

```text
frames 1388-1425: min≈629px, max≈998px, max_jump≈367px
frames 2228-2242: min≈607px, max≈977px, max_jump≈370px
```

2026-06-05 用户继续反馈在 Playback 下第 1000 和 1500 帧附近可复现“只检测到一半”的现象。同一截图 ROI 复现参数：

```text
ROI: center=(1184.52, 418.34), width=1269.76, height=381.92, angle=-15.23°
Frames: 1000 / 1500 / 1505 / 1543
Before fix: frame 1000≈1001px；frame 1500/1505/1543≈608-609px。
```

#### Expected

```text
1. A 类 ROI 内同一个网格主体即使因低对比、局部断开被分割成左右两个大组件，也不能只取其中最大组件作为正式外包络。
2. 同主体多组件合并只能发生在面积、纵向重叠、水平间距都合理的 mesh-like 组件之间，不能把外部 speck、夹具或气泡合并为主体边界。
3. 推荐/完整 ROI 下，同一时间段 distance 应稳定，不能把分割伪差解释为真实形变。
```

#### Actual

```text
1. 截图 ROI 只覆盖网格结构上半部，底部连接/闭合区域在 ROI 外。
2. 某些帧中 mesh mask 能连上左侧网格，left_local≈160，distance≈996-998px。
3. 某些帧中 mesh mask 只保留右侧较大主体，left_local≈524-542，distance≈607-634px。
4. 修复前结果仍标为 VALID，Run 曲线呈现非物理断崖。
5. 用默认完整 ROI 对同一帧复算稳定：同角度 ROI 在 frame 1388-1425 为 983px，frame 2228-2242 为 986px；0° 默认 ROI 同段约 991px / 984px。
```

Evidence:

```text
output/debug/p0015_a_20260522_old_roi_current_detector_windows.json
output/debug/p0015_a_20260522_roi_comparison_current_detector.json
output/debug/p0015_visual/contact_sheet_roi_mask.png
output/debug/p0015_visual/summary.json
```

#### Confirmed cause

截图 ROI 的中心偏上，只截到网格结构上半条带；因为关键连接区域不在 ROI 内，A 类 mesh mask 在部分帧会被分割成左、右两个大组件。修复前 `BalloonEnvelopeDetector` 的 `_largest_mesh_region()` 只保留最大连通域，导致左半主体被丢弃，正式 A/B 只覆盖右半段，distance 从约 1000px 掉到约 608px。

#### Fix summary

已修复 `backend/src/yyt1771_g3/vision/detectors.py`：

```text
1. `_largest_mesh_region()` 不再只取最大组件。
2. 先筛选面积、宽度、高度满足 A 类 mesh 形态的候选组件。
3. 以最大组件为主体，将面积足够、纵向重叠足够、水平间距合理的相关大组件合并为同一目标区域。
4. 仅把合并后的同主体区域交给后续 `archived_mesh_envelope_rows` 行窗口测宽。
5. P-0016 的气泡修正保持不变：正式 distance 仍使用同一 selected row/window；`mesh_global_span_px` 只作为 debug。
```

#### Tests run

```bash
PYTHONPATH=backend/src python3 - <<'PY'
# 读取 golden_a_20260522_dev_lab，复算截图 ROI 在 frame 1388-1425 / 2228-2242 的当前 detector 输出。
PY
PYTHONPATH=backend/src python3 - <<'PY'
# 对比截图 ROI、默认同角度 ROI、默认 0° ROI 在同一帧窗口的 current detector 输出。
PY
PYTHONPATH=backend/src python3 - <<'PY'
# 生成 ROI/mask 可视化证据。
PY
PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_golden_detector_smoke.py -q
# 4 passed in 3.45s
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
# 51 passed in 4.04s
cd frontend && npm test
# 3 passed
cd frontend && npm run build
# built successfully
```

#### Browser retest log

- Retest date: 2026-06-05
- Browser: Google Chrome 148 via Playwright headless; MCP Playwright used for Playback screenshots, independent Playwright script used for repeat run evidence
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176`
- Backend URL: `http://127.0.0.1:8022`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Playback / Run
- Steps: 在 Playback 页面填入 ROI `center=(1184.52, 418.34), width=1269.76, height=381.92, angle=-15.23°`，分别 probe frame 1000 / 1500 / 1543；随后从浏览器 Run 页面以同 ROI 触发 live offline run，窗口 start_frame=1450、max_frames=104，覆盖 frame 1500 / 1543。
- Expected: Playback frame 1500/1543 不再只测右半段；Run 窗口 distance 不出现约 608px 半宽断崖。
- Actual: Playback frame 1000=`1001.00px`，frame 1500=`995.00px`，frame 1543=`995.00px`；Run 1450-1553 共 104 帧全部生成检测结果，frame 1450=`995.00px`，1500=`995.00px`，1543=`995.00px`，1553=`994.00px`，全窗口 distance range≈`993.00-996.00px`。
- Result: PASS
- Evidence: `output/playwright/p0015_20260605_script_playback_frame1000.png`; `output/playwright/p0015_20260605_script_playback_frame1500.png`; `output/playwright/p0015_20260605_script_playback_frame1543.png`; `output/runs/run-golden_a_20260522_dev_lab-20260605T025743369841Z/run_manifest.json`; `output/runs/run-golden_a_20260522_dev_lab-20260605T025743369841Z/analysis_result.json`; `output/playwright/p0015_20260605_run_1450_1553_summary.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0016 — A 类气泡/低对比斑点会通过跨行边界拼接放大 distance

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, `BalloonEnvelopeDetector`
- Found date: 2026-06-04
- Last update: 2026-06-04
- Owner/tool: Codex

#### Problem

用户反馈 `golden_a_20260522_dev_lab` 在 frame 600 / 660 / 690 / 730 附近，红框处疑似气泡移动到物体边界附近后，distance 从约 1058-1061px 上升到约 1071px，随后气泡越过边界后 distance 又回落，说明待测物体本体基本未发生对应形变。

复算截图 ROI：

```text
ROI: center=(1179.71, 680.43), width=1236.76, height=820.9, angle=-16.27°
Dataset: golden_a_20260522_dev_lab
Frames checked: 600, 660, 690, 730
```

当前 `archived_mesh_envelope_rows` 的行窗口诊断显示，frame 690 的同一行最宽窗口仍约 1001px，但正式 distance 使用了跨行汇总边界：

```text
frame 600: global left=83.0 at row_v=547, global right=1125.0 at row_v=279, global_width=1042.0, best_row_width=1002.0
frame 660: global left=80.0 at row_v=558, global right=1125.0 at row_v=282, global_width=1045.0, best_row_width=1001.0
frame 690: global left=76.12 at row_v=558, global right=1125.0 at row_v=286, global_width=1048.88, best_row_width=1001.0
frame 730: global left=84.0 at row_v=545, global right=1124.0 at row_v=275, global_width=1040.0, best_row_width=1001.0
```

#### Expected

```text
1. A 类正式 A/B 必须来自同一测量轴/同一稳定行窗口上的整体外包络接触点。
2. 气泡、低对比斑点、污点、外部 speck 或短暂移动伪影不能扩大正式 max-width。
3. 对比度/灵敏度参数可以作为诊断或高级参数，但不得让正式 distance 依赖人工反复调阈值才能稳定。
```

#### Actual

`_mesh_envelope_candidate()` 当前使用：

```text
left = min(row["left"] for row in rows)
right = max(row["right"] for row in rows)
best_row = max(rows, key=(width, pixel_count))
```

这会把低处某一行的最左边界和高处另一行的最右边界组合成正式 distance，再将 A/B 画在 `best_row_v` 上。气泡/低对比斑点只要把某一行的 left 往外推，就会放大整帧 distance，即使真正最宽的同一行窗口没有变宽。

Evidence:

```text
output/debug/p0016_bubble/summary.json
output/debug/p0016_bubble/row_diagnostics.json
output/debug/p0016_bubble/contact_sheet_mask_overlay.png
```

#### Suspected cause

根因不是单纯“对比度灵敏度不足”，而是 A 类正式宽度计算违反了同一测量轴原则：正式 distance 把不同 row/window 的 left/right 拼接成一条测量线。气泡只是触发了局部 left boundary 的变化，从而暴露了这个跨行边界拼接问题。

#### Fix summary

2026-06-04 修复：

```text
1. `_mesh_envelope_candidate()` 的正式 A/B 和 distance 改为使用同一个 selected_row/window 的 left/right。
2. 跨行 min-left / max-right 不再作为正式 distance，只保留为 debug artifacts：
   `mesh_global_left_local_px`, `mesh_global_right_local_px`, `mesh_global_span_px` 等。
3. `mesh_selected_row_width_px` 与正式 `distance_px` 一致，用于证明正式测量线未跨行拼接。
4. 增加 regression：synthetic rows 验证不同 row 的 left/right 不会拼接；golden A 600/660/690/730 验证气泡段 distance 稳定。
5. 更新算法需求和 milestone 文档，明确 A 类同一 selected row/window 左右外包络跨度才是正式 distance。
```

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_envelope_detectors.py backend/tests/integration/test_golden_detector_smoke.py -q
# 9 passed

PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
# 50 passed

npm test
# 3 passed

npm run build
# built successfully
```

#### Browser retest log

- Retest date: 2026-06-04
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8022/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps: Use ROI center=(1179.71, 680.43), width=1236.76, height=820.9, angle=-16.27; probe frames 600, 660, 690, 730; run same frame window.
- Expected: 气泡/低对比斑点不扩大正式 distance；A/B 来自同一 selected row/window；诊断可显示 artifact warning。
- Actual:
  - Setup probe:
    - frame 600: VALID, distance=1002px, selected_row_width=1002px, global_span=1042px
    - frame 660: VALID, distance=1001px, selected_row_width=1001px, global_span=1045px
    - frame 690: VALID, distance=1001px, selected_row_width=1001px, global_span=1048.88px
    - frame 730: VALID, distance=1001px, selected_row_width=1001px, global_span=1040px
  - Run 600-730 browser-origin request: 131 frames, frame range 600-730, invalid_count=0, distance range 1001-1003px, max adjacent jump≈1px, temperature_distance points=131.
  - Run page realtime UI from frame 600 updated image/overlay and temperature/distance curves; stopped at frame 717 because UI currently exposes only full-run start/stop, while exact 600-730 window was verified through the browser-origin run request above.
- Result: PASS
- Evidence:
  - `output/playwright/p0016_setup_frame600.png`
  - `output/playwright/p0016_setup_frame690.png`
  - `output/playwright/p0016_setup_frame730.png`
  - `output/playwright/p0016_run_600_730_live.png`
  - `output/runs/run-golden_a_20260522_dev_lab-20260604T150903174501Z/run_manifest.json`
  - `output/runs/run-golden_a_20260522_dev_lab-20260604T150903174501Z/analysis_result.json`

#### Browser retest log — 2026-06-05 audit

- Retest date: 2026-06-05
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8022/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps: Re-open current app; use ROI center=(1179.71, 680.43), width=1236.76, height=820.9, angle=-16.27; probe frames 600, 660, 690, 730 through Setup UI; run browser-origin 600-730 window with max_frames=131.
- Expected: frame 690 bubble/global span remains diagnostic only; formal distance equals same selected row/window width; no sudden formal distance spike.
- Actual:
  - Setup probe: frame 600=1002px, frame 660=1001px, frame 690=1001px, frame 730=1001px; all VALID, `contour_measurement_mode=archived_mesh_envelope_rows`.
  - frame 690 retained `mesh_global_span_px=1048.88` as debug, while `mesh_selected_row_width_px=1001` and `distance_px=1001`.
  - Run 600-730: 131 frames, invalid_count=0, distance range 1001-1003px, max adjacent jump≈1px, distance_time points=131, temperature_distance points=131.
- Result: PASS
- Evidence:
  - `output/playwright/p0016_20260605_setup_frame690.png`
  - `output/runs/run-golden_a_20260522_dev_lab-20260604T160726718315Z/run_manifest.json`
  - `output/runs/run-golden_a_20260522_dev_lab-20260604T160726718315Z/analysis_result.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0017 — C 类全帧 Run 时底图可能变黑，只剩 overlay 和曲线继续更新

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `frontend/src/main.tsx`, `frontend/src/api/client.ts`, `backend/src/yyt1771_g3/api/main.py`
- Found date: 2026-06-05
- Last update: 2026-06-05
- Owner/tool: Codex

#### Problem

用户反馈 `golden_c_20260529_dev_lab` 在 full offline Run 中，运行到约 frame 257 后实时图像区域变成深色背景，但 ROI / A-B overlay、distance、temperature 和曲线仍继续更新。

已复现同类显示链路问题：

```text
Dataset: golden_c_20260529_dev_lab
Page: Run
Start frame: 250
Observed frame: 302 附近
```

浏览器 DOM 证据显示实时帧标题和检测结果已推进，但底图 `<img>` 尚未加载完成：

```text
caption = golden_c_20260529_dev_lab · live frame 302
img.src = http://127.0.0.1:8022/api/offline-datasets/golden_c_20260529_dev_lab/frames/302.png
img.complete = false
img.naturalWidth = 0
img.naturalHeight = 0
```

Network 记录中同一段出现多次 PNG 请求被浏览器取消：

```text
/api/offline-datasets/golden_c_20260529_dev_lab/frames/307.png => net::ERR_ABORTED
/api/offline-datasets/golden_c_20260529_dev_lab/frames/318.png => net::ERR_ABORTED
```

后端原始帧和 PNG endpoint 已单独验证有效，frame 257/300 等不是空帧。

#### Expected

```text
1. Live offline Run 必须持续显示实时图像、后端 overlay、distance 和 temperature 曲线。
2. 检测和曲线可逐帧运行；显示层在下一张图未加载完成前不得清空上一张已显示底图。
3. 前端显示缩放或显示用缩略图不得影响正式 ROI、A/B、distance 计算，正式计算仍使用 source_pixel 原始帧坐标。
```

#### Actual

当前 `FrameCanvas` 直接把每个流式帧事件的 `imageUrl` 写入单个 `<img src>`。C 类 full run 按约 8 fps 更新 frame URL，但 2048×1364 PNG 的生成、传输和浏览器解码常达到约 300-500ms，慢于 125ms 的 URL 更新间隔，导致浏览器不断取消前一个图像请求，实时底图可能暂时清空或长时间停留在深色背景。

#### Suspected cause

根因是前端实时底图更新策略与 PNG 加载速度不匹配：显示层按检测帧率替换 `<img src>`，但图像资源加载比检测事件慢。后端帧数据、检测结果和温度曲线本身仍在更新。

#### Fix summary

2026-06-05 修复：

```text
1. 后端离线帧 PNG endpoint 增加 `max_width` 查询参数，用于实时显示缩略图；正式检测仍读取原始 npy 帧，不受影响。
2. 前端 live Run 帧 URL 增加 `?max_width=1024`，降低浏览器每帧 PNG 传输和解码压力。
3. `FrameCanvas` 改为使用稳定图像加载策略：下一帧图像加载完成后才替换当前底图；加载未完成时保留上一张已显示底图，避免深色空画布。
4. 增加 PNG 缩放 endpoint regression，覆盖 `max_width` 正常缩放和非法参数 400。
```

#### Tests run

```bash
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_offline_dataset_api.py -q
# blocked in .venv: starlette.testclient requires missing httpx/httpx2

PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_offline_dataset_api.py -q
# 1 passed

curl -sS -o /tmp/g3_c_257_1024.png -w '%{http_code} %{content_type} %{size_download}\n' 'http://127.0.0.1:8022/api/offline-datasets/golden_c_20260529_dev_lab/frames/257.png?max_width=1024'
file /tmp/g3_c_257_1024.png
# 200 image/png 283906
# PNG image data, 1024 x 682, 8-bit grayscale, non-interlaced

curl -sS -o /tmp/g3_bad.png -w '%{http_code} %{content_type} %{size_download}\n' 'http://127.0.0.1:8022/api/offline-datasets/golden_c_20260529_dev_lab/frames/257.png?max_width=0'
# 400 application/json 49

PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
# 51 passed

npm test
# 3 passed

npm run build
# built successfully
```

#### Browser retest log

- Retest date: 2026-06-05
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176/`
- Backend URL: `http://127.0.0.1:8022/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Run
- Steps: 先用旧行为复现 C 类 Run 从 frame 250 启动后底图空黑；修复后刷新前端，选择 C 数据集，在 Setup 输入 start frame=250，切换 Run，启动 full offline run，观察经过 frame 257、300、400 后的图像、overlay、distance、temperature 和 live curves。
- Expected: 实时底图持续可见；图像 URL 使用显示缩略参数；图像元素 `complete=true` 且 `naturalWidth>0`；overlay、distance、temperature 和曲线继续更新；Network 不再出现关键帧段连续 `ERR_ABORTED`。
- Actual: 修复前复现 frame 302 附近 `<img complete=false naturalWidth=0>` 且 Network 出现 `net::ERR_ABORTED`；修复后 Run 到 live frame 434/500+ 时底图持续可见，DOM 显示已加载底图 URL 为 `.../frames/433.png?max_width=1024`，`complete=true`，`naturalWidth=1024`，`naturalHeight=682`。Network 记录中 frame 250-600+ 的 `?max_width=1024` 图像请求返回 `200 OK`，Run 页截图显示实时图像、ROI、A/B、distance、temperature 和曲线区域均可见。
- Result: PASS
- Evidence:
  - `output/playwright/p0017_20260605_run_c_blank_repro.png`
  - `output/playwright/p0017_20260605_run_c_frame434_visible.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0018 — Run/Analysis 应以 distance-temperature 和 AFAS As/Af 后处理为主，并补温控显示/设置

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/services/analysis_service.py`, `backend/src/yyt1771_g3/core/models.py`, `frontend/src/curves.ts`, `frontend/src/main.tsx`
- Found date: 2026-06-05
- Last update: 2026-06-05
- Owner/tool: Codex

#### Problem

用户要求参考 `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter` 修正当前 G3 Run / Analysis / Setup：

```text
1. Run 和 Analysis 主曲线应为 distance-temperature；当前 Run 显示 Distance-time 和 Temperature-time。
2. Setup 除 ROI 设置外，需要温度实时显示、温控目标温度设置和功率设置；Run 也需要温度实时显示。
3. Run 无论因预设温度到达停止还是手动停止，都应可以进入 Analysis 做分析。
4. Analysis 的方式、曲线平滑、Af、As 点计算需要参考 yyt1771_starter。
```

#### Expected

```text
1. Run 页面实时曲线以 temperature-distance 为主，并保留坐标轴。
2. Analysis 页面展示 AFAS 风格的 temperature-distance 平滑曲线、As、Af-tan、最大斜率点和分析状态。
3. Setup / Run 页面显示当前温度，并提供目标温度、输出功率参数输入。
4. 手动停止 live offline run 后，已采集的 partial run 也能作为 runResult 进入 Analysis。
5. AFAS 后处理至少包括温度分组、异常点修复、Savitzky-Golay 平滑、低温/高温基线、最大斜率切线和 As/Af-tan 计算。
```

#### Actual

当前 G3：

```text
1. `buildRunCurveSpecs()` 返回 Distance-time 和 Temperature-time。
2. `AnalysisResult` 只包含 raw curve arrays，没有 AFAS preprocessing / tangent analysis 结果。
3. Setup 只显示 probe 后 temperature，不提供温控目标温度/功率设置。
4. Run 手动 Stop 会 abort stream 并把 liveRun 标记 stopped，但不会把 partial liveRun 转为 runResult，因此 Analysis 页面没有可分析 run。
```

#### Suspected cause

G3 当前实现完成了基础温度同步和 curve point 保存，但尚未迁移一代 `src/curve/afas_preprocessing.py` 与 `src/curve/afas_postprocessing_analysis.py` 的后处理合同，也没有把温控目标/功率参数纳入测量配置和 UI 状态机。

#### Fix summary

2026-06-05:

```text
1. 新增 G3 本地 AFAS 后处理服务，参考 yyt1771_starter 的温度分组、rolling median/MAD 异常点修复、Savitzky-Golay 平滑、最大斜率切线、低温/高温基线和 As/Af-tan 交点计算。
2. AnalysisResult 增加 afas_preprocessing / afas_analysis；Run / Analysis 曲线规格改为单条 distance-temperature，Analysis 优先显示 smoothed distance-temperature。
3. Setup 增加 Temperature Control 面板：当前温度、Target °C、Power %；Run 增加当前温度、Target、Power 显示。
4. DetectorConfig 增加 target_temperature_celsius / temperature_power_percent。target 默认为空，避免默认截断全帧 run；用户设置 target 后，offline run 达到目标温度会停止并保存 analysis。
5. 修复手动 Stop 后 partial run 无法正式分析的问题：stream 内层 run 生成器在浏览器 abort 时会被显式 close，已处理帧会保存 run_manifest / analysis_result，stop_reason=stream_closed。
6. Analysis / Export 页面在手动 Stop 后通过 run_id 读取后端保存的正式 partial run，而不是只使用前端临时 live analysis。
```

#### Tests run

```text
PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_live_offline_run_service.py::test_streamed_live_offline_run_saves_partial_result_when_stopped -q
Result: PASS

PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_live_offline_run_service.py::test_live_offline_run_stops_and_saves_analysis_when_target_temperature_reached -q
Result: PASS

PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_live_offline_run_service.py backend/tests/integration/test_live_offline_run_api.py -q
Result: 7 passed

PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
Result: 63 passed

npm test
Result: 3 passed

npm run build
Result: PASS
```

#### Browser retest log

- Retest date: 2026-06-05
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8023/`
- Dataset: `golden_c_20260529_dev_lab`
- Page: Setup / Run / Analysis
- Steps: 使用干净后端 8023 和前端 5174；选择 C 数据集；Setup 执行 Probe，查看温度实时显示、Target °C、Power %；Run 启动 full offline run，确认实时 frame/overlay 和单条 Distance-temperature 曲线；手动 Stop 后切 Analysis；再次在 Setup 设置 target=-1.9°C，Run 启动后等待目标温度自动停止，再切 Analysis。
- Expected: Setup 有当前温度、目标温度和功率设置；Run 有当前温度、目标和功率显示，实时曲线为 Distance-temperature；手动 Stop 和目标温度 Stop 都能保存后端 run/analysis 并在 Analysis 页面显示 run_id、formal temperature-distance 点、AFAS 结果面板和平滑曲线。
- Actual: Setup Probe 后显示 Current=-2.00°C、Target 为空、Power=100%；Run 页面显示 live frame、Current temperature、Distance-temperature 曲线；手动 Stop 保存 `run-golden_c_20260529_dev_lab-20260605T145511282467Z`，Analysis 显示 149 个 formal temp-distance 点和 smoothed distance-temperature；target=-1.9°C 自动停止保存 `run-golden_c_20260529_dev_lab-20260605T150101513728Z`，run_manifest 显示 `stop_reason=target_temperature_reached`、68 个 frame_records，Analysis 显示 67 个 formal temp-distance 点和 AFAS 面板。真实 C 素材本段温度范围较窄，AFAS tangent result 合理显示 `unavailable`，未强行输出伪 As/Af。
- Result: PASS
- Evidence:
  - `output/playwright/p0018_setup_temperature_controls_c.png`
  - `output/playwright/p0018_run_distance_temperature_live.png`
  - `output/playwright/p0018_analysis_afas_after_manual_stop.png`
  - `output/playwright/p0018_run_target_temperature_stop.png`
  - `output/playwright/p0018_analysis_after_target_stop.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0019 — Vite 自动回退到 5177 时 backend CORS 未放行导致前端 Failed to fetch

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `backend/src/yyt1771_g3/api/main.py`
- Found date: 2026-06-05
- Last update: 2026-06-05
- Owner/tool: Codex

#### Problem

真实浏览器复测 `realcamera-temp` 分支时，5176 端口被占用，Vite 自动使用 `http://127.0.0.1:5177/`。前端打开后显示 `Failed to fetch`，dataset rail 为空。

#### Expected

开发服务器自动回退到常见 Vite 端口时，backend CORS 应允许本地前端访问 API，至少不能阻断 Setup / Run 页面基础数据加载。

#### Actual

backend 只放行到 5176，`Origin: http://127.0.0.1:5177` 的 preflight 返回 400，导致前端无法加载 `/api/offline-datasets`。

#### Fix summary

2026-06-05:

```text
1. backend CORS allow_origins 补充 localhost/127.0.0.1 的 5177 和 5178。
2. 新增 CORS 回归测试，覆盖 Vite fallback port 5177。
```

#### Tests run

```text
PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_cors.py -q
Result: PASS

PYTHONPATH=backend/src python3 -m pytest backend/tests -q
Result: 58 passed
```

#### Browser retest log

- Retest date: 2026-06-05
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8030/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps: 打开前端 5177；确认 dataset rail 加载 A/C 数据集；进入 Run 页；执行温控/相机按钮和短 offline run。
- Expected: 前端不再 `Failed to fetch`，Run 页能读取 backend API。
- Actual: dataset rail 正常显示 A/C 数据集；Run 页正常渲染。
- Result: PASS
- Evidence: `output/playwright/realcamera_temp_run_retest_20260605.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0020 — G3 真实相机 + LU92XX 温控链路需接入并等待真实硬件复测

- Status: BLOCKED
- Priority: P0
- Module: `backend/src/yyt1771_g3/camera`, `backend/src/yyt1771_g3/temperature`, `backend/src/yyt1771_g3/services/real_camera_run_service.py`, `frontend/src/main.tsx`
- Found date: 2026-06-05
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户要求在 G3 本项目 `realcamera-temp` 分支开始构建真实相机和温控，并以 `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter` 作为可用硬件环境和设置参考。

G3 原有真实相机路径只覆盖 lazy import / fake SDK / 缺 SDK 错误态；真实 run 中温度仍为 missing 占位，没有 LU92XX Modbus RTU 控制器，也没有本项目硬件 profile。

#### Expected

```text
1. G3 通过本地 profile 读取真实相机和温控设置，不在源码中硬编码本机路径。
2. Hik MVS SDK 仍 lazy import；无 SDK 时 offline/playback/live offline run 可用。
3. 相机 adapter 支持官方 MVS Python binding 的枚举、打开、Mono8、ROI、FPS、取帧。
4. LU92XX adapter 按 starter 已验证寄存器读 PV、写 SV、写输出功率。
5. Real camera run 每帧保存 raw frame、FrameRecord.camera_meta、TemperatureRecord、DetectionResult temperature fields 和 run/analysis。
6. Setup 页面提供当前温度读取、串口列表、target/power 配置和 unavailable/error 状态；温控调整不得触发真实相机 setup frame refresh。
7. Real camera Run 只使用 Setup 保存的 target/power，开始时 best-effort 设置 target/power/start_output，每帧保存 TemperatureRecord 和 DetectionResult。
8. TEMP_SYNC_OK / TEMP_SYNC_INTERPOLATED 才进入正式 temperature-distance / Af 曲线；TEMP_SYNC_MISSING / TEMP_SYNC_STALE 不得进入正式 Af 曲线。
```

#### Fix summary

2026-06-05:

```text
1. 新增 `core.hardware_config`，默认读取 `configs/local/realcamera_temp.local.yaml`，并提供 `configs/hardware/realcamera_temp.example.yaml`。
2. 新增 LU92XX Modbus RTU adapter：PV register 264、SV register 0、power register 4，支持 CRC、异常响应、target/power/start/stop/read。
3. 新增 serial-port discovery endpoint。
4. Hik MVS adapter 增加官方 `MvCamera` bridge：枚举设备、筛选 model/serial/ip、配置 Mono8、曝光、增益、设备 ROI、帧率、payload buffer 和 frame meta。
5. `run_real_camera()` 增加可选 `temperature_controller`，运行前设置 target/power/start_output，每帧同步温度，结束时 stop_output/close。
6. API 新增 `/api/hardware/profile`、`/api/temperature/serial-ports`、`/api/temperature/status`，并让 `/api/camera/preview` 和 `/api/real-camera-runs` 使用 hardware profile。
7. Run 页面新增 `Read temp` 和 `Ports` 控件，显示温控 source/current 和串口列表。
```

2026-06-08:

```text
1. 温控配置迁移到 Setup 页面：Read temp、Ports、target_temperature_celsius、temperature_power_percent、source/status/current/error 均在 Setup Temperature Control 中显示。
2. Run 页面移除温控 Read temp / Ports 操作，只显示 Setup summary 和 backend run result，避免 Run 承担临时温控配置职责。
3. `run_real_camera()` 的 target/power/start_output 改为逐项 best-effort：某一项失败时仍尝试后续控制动作，错误写入 TemperatureRecord。
4. Setup 中 Read temp、Ports、target/power 调整均不调用真实相机 preview refresh；Real camera preview、Freeze、ROI、Run 继续可用。
```

#### Tests run

```text
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_hardware_config.py backend/tests/unit/test_lu92xx_modbus.py backend/tests/unit/test_camera_lazy_import.py backend/tests/integration/test_real_camera_run_service.py backend/tests/integration/test_camera_api.py -q
Result: 16 passed

PYTHONPATH=backend/src python3 -m pytest backend/tests -q
Result: 58 passed

npm run build
Result: PASS

npm test -- tests/setupSources.test.mjs
Result: PASS, 28 tests passed.

PYTHONPATH=backend/src pytest backend/tests/integration/test_real_camera_run_service.py::test_real_camera_run_best_effort_temperature_startup_attempts_all_controls
Result: PASS

PYTHONPATH=backend/src pytest backend/tests/integration/test_real_camera_run_service.py backend/tests/integration/test_camera_api.py backend/tests/unit/test_analysis_service.py
Result: PASS, 18 tests passed.
```

#### Browser retest log

- Retest date: 2026-06-05
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8030/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps: 打开 Run 页面；点击 `Read temp`；点击 `Ports`；点击 Real Camera `Preview`；将 start frame 设为 5806 后执行 2 帧 Live Offline run。
- Expected: 未配置真实温控时返回结构化 503；串口列表可显示；无 MVS SDK 时返回结构化 503，且 offline run 仍可运行并保存分析。
- Actual: `Read temp` 显示 `LU92XX temperature controller is not configured`；`Ports` 显示 `/dev/cu.Bluetooth-Incoming-Port` 与 `/dev/cu.debug-console`；Real Camera `Preview` 显示 `Hik MVS SDK is not available`；短 offline run 保存 2 帧，显示 overlay、distance、temperature、distance-temperature 曲线。
- Result: PASS for no-hardware fallback and UI flow; real hardware verification still pending.
- Evidence:
  - `output/playwright/realcamera_temp_missing_sdk_retest_20260605.png`
  - `output/playwright/realcamera_temp_run_retest_20260605.png`

#### Remaining verification

2026-06-06：用户确认当前没有实际连接相机和温控。代码路径、fake source、无硬件 fallback 均已验证；以下真实硬件步骤被硬件条件阻塞，不能标记为浏览器验证通过。

2026-06-07：真实 Hik 相机已连接并完成 x86 MVS runtime、API 和浏览器复测。相机部分不再阻塞：

```text
Camera model: MV-CA060-11GM
Serial number: 00J67378626
IP: 192.168.3.211
Frame shape: 1364 x 2048, uint8, Mono8
Real Camera Preview: PASS
Real Camera Run: PASS, 160 frames saved
Run id: run-real_camera-20260607T143255949515Z
FrameRecord source: hik_gige_mvs
Temperature sync: TEMP_SYNC_MISSING for all frames because LU92XX serial is unavailable
Formal temperature-distance points: 0, as required for TEMP_SYNC_MISSING
```

LU92XX 温控仍阻塞：当前系统串口只看到 `/dev/cu.Bluetooth-Incoming-Port` 和 `/dev/cu.debug-console`，配置中的 `/dev/cu.usbserial-1210` 不存在；`GET /api/temperature/status` 返回 503：

```text
Failed to open LU92XX serial transport:
[Errno 2] could not open port /dev/cu.usbserial-1210
```

因此 P-0020 仍保持 `BLOCKED`，需要在 LU92XX 控制器和串口连接后补做：

```text
1. Read temp 成功读取 LU92XX PV。
2. Real Camera Run 成功写 target/power/start。
3. 图像帧与 LU92XX 温度时间戳达到 <=10 ms 目标或明确记录 INTERPOLATED/STALE/MISSING。
4. 至少出现 TEMP_SYNC_OK 或 TEMP_SYNC_INTERPOLATED 点，并进入正式 temperature-distance 曲线。
5. 结束时 stop_output/close 成功，并记录截图、run manifest、analysis_result 和必要日志。
```

#### Real camera browser retest log

- Retest date: 2026-06-07
- Browser: Headless Google Chrome via Playwright
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8032/`
- Dataset: `real_camera`
- Page: Run
- Steps: Start x86 backend with starter MVS runtime; open frontend; click `Read temp`; click Real Camera `Preview`; click Real Camera `Run`; wait for 160-frame run; inspect trend, frame canvas, API responses, and saved raw-frame URL.
- Expected: Real camera Preview/Run succeeds with Hik camera metadata; run saves raw frames and backend detections; TEMP_SYNC_MISSING frames do not enter formal temperature-distance curve while LU92XX serial is absent.
- Actual: Preview returned `MV-CA060-11GM`, serial `00J67378626`, IP `192.168.3.211`, shape `1364 x 2048`; Real Camera Run saved 160 frames, all first statuses sampled were `VALID`, sync statuses were `TEMP_SYNC_MISSING`, and formal temperature-distance point count was `0`. `Read temp` remained unavailable because `/dev/cu.usbserial-1210` was missing.
- Result: PASS for real camera; BLOCKED for LU92XX temperature controller.
- Evidence:
  - `output/playwright/p0042_realcamera_preview_browser_20260607.png`
  - `output/playwright/p0042_realcamera_run_browser_20260607.png`
  - `output/playwright/p0042_realcamera_browser_summary_20260607.json`
  - `output/hardware/real_camera_api_summary_20260607_after_p0042.json`

#### Setup temperature browser retest log

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8034/`
- Dataset: `golden_a_20260522_dev_lab` plus mocked `real_camera` preview/run and mocked LU92XX unavailable response
- Page: Setup / Run
- Steps:
  1. Install Playwright routes for `/api/camera/preview`, `/api/temperature/status`, `/api/temperature/serial-ports`, `/api/real-camera-runs`, and `/api/runs/{run_id}/frames/1.png`.
  2. Open Setup, select `Real camera`, and let Setup auto-read temperature status.
  3. Confirm Setup Temperature Control shows `Status = unavailable`, `Error = /dev/cu.usbserial-1210 not found`, `Read temp`, `Ports`, `target_temperature_celsius`, and `temperature_power_percent`.
  4. Freeze the real-camera setup frame, then click `Read temp`, click `Ports`, and edit target/power to `42.5` / `55`.
  5. Confirm preview request count stays unchanged after those temperature actions.
  6. Open Run and start real-camera run; inspect intercepted `/api/real-camera-runs` request body and resulting frame display.
- Expected: Missing `/dev/cu.usbserial-1210` is clearly shown in Setup; temperature actions do not refresh true-camera setup frames; Real camera preview/Freeze/ROI/Run remain usable; Run uses Setup target/power and does not offer Read temp / Ports.
- Actual:
  - Setup displayed Real Camera Preview in Frozen frame mode with ROI overlay, and Temperature Control showed unavailable status plus structured `/dev/cu.usbserial-1210 not found` error.
  - `previewRequests = 2`, `previewAfterFreeze = 2`, `previewAfterTempActions = 2`; Read temp, Ports, target, and power changes did not trigger a new camera preview request.
  - Intercepted `/api/real-camera-runs` request contained `measurement_definition.detector_config.target_temperature_celsius = 42.5` and `temperature_power_percent = 55`.
  - Mock run result displayed `TEMP_SYNC_MISSING`; `analysis_result.temperature_distance` was empty.
  - Run page did not contain `Read temp`; run frame image source was `/api/runs/run-real_camera-temp-setup-fixture/frames/1.png?max_width=1024`; ROI edit handles count was `0`.
- Result: PASS for Setup unavailable UI and mocked formal run behavior; BLOCKED for full LU92XX hardware chain.
- Evidence:
  - `output/playwright/p0045_setup_temperature_control_unavailable.png`
  - `output/playwright/p0045_setup_temperature_control_unavailable_run_formal.png`

#### Real hardware Setup→Run browser retest log

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8032/`
- Dataset: `real_camera`
- Page: Setup / Run
- Steps:
  1. Start backend with x86 MVS environment on `8032` and frontend on `5177`.
  2. Open Setup, select `Source = Real camera`, and confirm automatic real camera preview.
  3. Confirm Setup shows `camera_status = ok`, model `MV-CA060-11GM`, serial `00J67378626`, IP `192.168.3.211`, `pixel_format = mono8`, frame shape `1364 × 2048`, frame timestamp, and preview refresh status.
  4. Click `Freeze`; confirm `Preview mode = Frozen frame`, `Frozen timestamp = 1780854696122`, and `Live refresh = Paused`.
  5. Use `New / reset ROI` and ROI controls on the frozen frame to set source-pixel ROI `center = 960,700`, `size = 900 × 300`, `angle = -4.5°`.
  6. Click `Capture new setup frame`; confirm frozen timestamp advances to `1780854783058` and ROI remains unchanged.
  7. Edit detector parameter `min_component_area_px = 95`; confirm frozen-frame guidance is visible and no `/api/camera/preview` request is sent.
  8. Edit `target_temperature_celsius = 42.5` and `temperature_power_percent = 55`, then click `Read temp` and `Ports`; confirm no `/api/camera/preview` request is sent.
  9. Open Run; confirm Setup Summary shows Real camera source, ROI, detector/object/width mode, `max_frames_per_run = 160`, `target_fps = 8`, target temperature `42.50 °C`, and power `55 %`.
  10. Click `Start real camera run`; inspect the POST body to `/api/real-camera-runs`.
  11. Wait for run completion and inspect `GET /api/runs/run-real_camera-20260607T175434488916Z`.
- Expected: Real camera Setup preview, Freeze, ROI editing, frozen refresh, detector-parameter frozen behavior, and formal Run should all work with the real Hik camera; missing LU92XX should be shown as unavailable and must not block camera preview/ROI/run; formal temperature-distance must exclude `TEMP_SYNC_MISSING` / `TEMP_SYNC_STALE`.
- Actual:
  - Camera Setup preview and Run passed with Hik camera metadata: `MV-CA060-11GM`, serial `00J67378626`, IP `192.168.3.211`, shape `1364 × 2048`, `mono8`.
  - Frozen `Capture new setup frame` updated timestamp from `1780854696122` to `1780854783058` and kept ROI `960,700 / 900 × 300 / -4.5°`.
  - Frozen detector edit and temperature actions sent `0` new `/api/camera/preview` requests.
  - `/api/temperature/status` remained `503 unavailable`; `/api/temperature/serial-ports` returned only `/dev/cu.Bluetooth-Incoming-Port` and `/dev/cu.debug-console`; configured `/dev/cu.usbserial-1210` was absent.
  - `/api/real-camera-runs` request used Setup `measurement_definition.source = real_camera`, `measurement_coordinates = source_pixel`, ROI `960,700 / 900 × 300 / -4.5°`, `min_component_area_px = 95`, `target_temperature_celsius = 42.5`, and `temperature_power_percent = 55`.
  - Run `run-real_camera-20260607T175434488916Z` saved 160 `FrameRecord`, 160 `TemperatureRecord`, and 160 `DetectionResult`; all detections were `VALID`; all detection temperature sync statuses were `TEMP_SYNC_MISSING`.
  - Run canvas image source was `http://127.0.0.1:8032/api/runs/run-real_camera-20260607T175434488916Z/frames/160.png?max_width=1024`.
  - `analysis_result.temperature_distance` contained `0` points, so no `TEMP_SYNC_MISSING` / `TEMP_SYNC_STALE` point entered the formal temperature-distance / Af curve.
- Result: PASS for real Hik camera Setup→Run; BLOCKED for full LU92XX temperature hardware chain because `/dev/cu.usbserial-1210` is not connected.
- Evidence:
  - `output/playwright/p0045_real_camera_setup_live_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_before_roi_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_roi_adjusted_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_refresh_roi_kept_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_params_temperature_20260608.png`
  - `output/playwright/p0045_real_camera_run_setup_summary_before_start_20260608.png`
  - `output/playwright/p0045_real_camera_run_result_20260608.png`
  - `output/hardware/p0045_real_camera_setup_run_summary_20260608.json`
  - `output/runs/run-real_camera-20260607T175434488916Z/run_manifest.json`
  - `output/runs/run-real_camera-20260607T175434488916Z/analysis_result.json`

#### Final status

BLOCKED


---

### P-0021 — 本地 LU92XX 串口配置存在但未连接时会盖过相机 SDK 缺失错误

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `backend/src/yyt1771_g3/api/main.py`, `backend/src/yyt1771_g3/services/real_camera_run_service.py`
- Found date: 2026-06-05
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

将参考项目 `dev_lab.local.yaml` 的 LU92XX 串口写入 G3 本地硬件 profile 后，在当前没有 `/dev/cu.usbserial-1210` 设备的环境运行全量 backend tests，`/api/real-camera-runs` 的无 SDK 错误测试失败。

#### Expected

```text
1. 无 MVS SDK / 无相机环境下，real camera run 应优先返回结构化 camera unavailable 错误。
2. 温控串口未连接时，不应盖过相机 preview/run 的相机错误。
3. 温控不可用时，DetectionResult 应能记录 TEMP_SYNC_MISSING，而不是让 run 在准备阶段崩溃。
```

#### Actual

```text
PYTHONPATH=backend/src python3 -m pytest backend/tests -q
Result: 1 failed, 58 passed

Failure:
RuntimeError: Failed to open LU92XX serial transport:
[Errno 2] could not open port /dev/cu.usbserial-1210
```

#### Suspected cause

`run_real_camera()` 在取第一帧前先调用 `_prepare_temperature_controller()`，且 finally 中 `stop_output()` 也会重新打开串口；温控串口缺失时会在相机 SDK lazy import 之前抛错。

#### Fix summary

2026-06-05:

```text
1. `run_real_camera()` 中温控准备阶段改为 best-effort：target/power/start_output 失败时记录 startup_error，不再中止相机取帧。
2. 每帧读取温度时，如果存在 startup_error，写入 TemperatureRecord.error，并将 DetectionResult 标为 TEMP_SYNC_MISSING。
3. 温控 stop_output/close 阶段不再盖过主流程错误，避免无 SDK/无相机环境被串口错误覆盖。
4. 新增回归测试覆盖温控 prepare/stop 失败但相机 run 仍保存帧和 TEMP_SYNC_MISSING 的场景。
```

#### Tests run

```text
PYTHONPATH=backend/src python3 -m pytest backend/tests -q
Initial result before fix: FAIL, 1 failed / 58 passed

PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_real_camera_run_service.py -q
Red result before fix: FAIL, new regression reproduced prepare/stop failure

PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_real_camera_run_service.py backend/tests/integration/test_camera_api.py -q
Result: PASS, 9 passed

PYTHONPATH=backend/src python3 -m pytest backend/tests -q
Result: PASS, 60 passed

npm run build
Result: PASS
```

#### API retest log

```text
Backend URL: http://127.0.0.1:8030/
GET /api/temperature/status
Result: HTTP 503, LU92XX serial unavailable as expected in no-hardware environment.

GET /api/camera/preview
Result: HTTP 503, camera_status=unavailable, message contains "Hik MVS SDK is not available".

POST /api/real-camera-runs
Result: HTTP 503, camera_status=unavailable, message contains "Hik MVS SDK is not available".
The LU92XX serial error no longer masks the camera unavailable response.
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:4173/`
- Backend URL: `http://127.0.0.1:8031/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps: 在未连接 Hik 相机 / 未安装 MVS SDK / 未连接 LU92XX 的环境中，点击 `Read temp`、`Ports`、Real Camera `Preview`、Real Camera `Run`。
- Expected: `/api/temperature/status` 可返回温控不可用；`/api/temperature/serial-ports` 可返回系统串口；Real Camera Preview/Run 应优先显示相机 SDK 不可用，不被 LU92XX 串口错误盖住；Live Offline partial run 结果仍可显示。
- Actual: `/api/temperature/status` 返回 503；`/api/temperature/serial-ports` 返回 200；`/api/camera/preview` 和 `/api/real-camera-runs` 返回 503，页面显示 `Hik MVS SDK is not available; offline playback and live offline run remain available`；页面正文中未出现 LU92XX/serial 错误盖住相机错误。
- Result: PASS
- Evidence: `output/playwright/p0021_no_hardware_fallback_retest.png`, `output/playwright/p0021_no_hardware_fallback_eval.json`

Full real camera + LU92XX browser verification remains tracked in P-0020; camera now passes, LU92XX remains blocked until `/dev/cu.usbserial-1210` is connected.

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0022 — Run 实时 temperature-distance 曲线仍使用原始点，未采用 starter 平滑预处理

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/services/live_offline_run_service.py`, `backend/src/yyt1771_g3/services/afas_analysis.py`, `frontend/src/curves.ts`, `frontend/src/main.tsx`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

用户在 Run 页面观察到 A 类数据 `golden_a_20260522_dev_lab` 的实时 temperature-distance 曲线出现明显横向/纵向折线，询问是否没有做平滑，并要求学习 `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter` 中的平滑方式。

#### Expected

```text
1. Run 和 Analysis 的 temperature-distance 曲线均应采用后端生成的 AFAS 预处理结果。
2. AFAS 预处理应对齐 starter：重复温度先分组聚合，再进行滚动中值/MAD 离群修复，最后 Savitzky-Golay 平滑。
3. 前端只显示后端生成的曲线结果，不作为正式平滑或 AFAS 计算源。
4. 温度同步 STALE/MISSING 点不得进入正式 temperature-distance 或 AFAS 曲线。
```

#### Actual

```text
1. Analysis 页面已优先读取 `afas_preprocessing.smoothed`。
2. Run 页面仍直接绘制实时追加的原始 `temperature_distance` 点。
3. 实时流事件未携带当前已处理帧的 AFAS smoothing preview。
4. 重复/离散温度值按采集顺序连线时，会产生用户截图中的横竖折线。
```

#### Suspected cause

`frontend/src/curves.ts` 中 `buildRunCurveSpecs()` 使用 raw `analysis.temperature_distance`；`backend/src/yyt1771_g3/services/live_offline_run_service.py` 的 frame event 只发送单帧 raw curve point，没有发送累计曲线的 AFAS 预处理结果。

#### Fix summary

2026-06-06:

```text
1. Live offline run 的 frame event 增加后端生成的 `afas_preprocessing` / `afas_analysis` 预览。
2. 前端 Run 实时状态接收该预览，Run 曲线与 Analysis 曲线一样优先绘制 `afas_preprocessing.smoothed`。
3. AFAS Savitzky-Golay 窗口在数据点少于默认 51 点但仍足够平滑时，会按 starter 的 0.55 数据比例自动缩小到安全奇数窗口。
4. 数据太短无法满足 polyorder 最小窗口时，明确跳过 smoothing 并记录 warning；仍保留按温度分组后的 smoothed payload 作为显示源。
5. 新增前端回归测试覆盖 Run 曲线优先使用后端 smoothed preview。
6. 新增后端回归测试覆盖 live stream event 携带 AFAS preview，以及 21 点短序列自动缩小 smoothing window。
```

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_analysis_service.py::test_afas_preprocessing_reduces_savgol_window_for_short_live_series -q
Result: FAIL before fix; PASS after fix

PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_analysis_service.py::test_afas_preprocessing_reduces_savgol_window_for_short_live_series backend/tests/integration/test_live_offline_run_service.py::test_streamed_live_offline_run_frame_events_include_afas_preview -q
Result: 2 passed

PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
Result: 66 passed

npm test
Result: 4 passed

npm run build
Result: PASS
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5178/`
- Backend URL: `http://127.0.0.1:8024/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run / Analysis Export
- Steps: 打开前端；确认选择 A 数据集；在 Setup 将当前帧设为 250；进入 Run 启动 live offline run；观察 324/357 帧附近实时图像、温度、distance 和曲线；手动 Stop 保存 partial run；进入 Analysis 页面查看同一 run。
- Expected: Run 实时曲线和 Analysis 曲线均显示 backend AFAS 预处理后的 temperature-distance；横轴为 Temperature，纵轴为 Distance；后端 analysis payload 中 `smoothed.applied=true`，有效窗口自动小于默认 51。
- Actual: Run 页面实时显示图像、温度、distance 和 `Smoothed distance - temperature` 曲线；Analysis 页面同一 run 显示 `Formal temp-distance points=142` 和 `Smoothed distance - temperature`。API 抽查 `GET /api/runs/run-golden_a_20260522_dev_lab-20260606T003329001161Z` 返回 `raw=142`, `grouped=21`, `smoothed=21`, `smoothingApplied=true`, `effectiveWindow=11`，warning 为 `window_length (51) reduced to 11 to avoid Savitzky-Golay edge distortion`。
- Result: PASS
- Evidence: `output/playwright/p0022_run_afas_savgol_golden_a.png`, `output/playwright/p0022_analysis_afas_savgol_golden_a.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0023 — 手动 Stop 后等待 partial run 落盘期间会产生短暂 404 网络日志

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P2
- Module: `frontend/src/main.tsx`, `backend/src/yyt1771_g3/services/live_offline_run_service.py`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

P-0022 浏览器复测中，手动点击 Stop 后，前端在等待 `stream_closed` partial run 落盘期间会请求 `/api/runs/{run_id}`，浏览器控制台记录多条 404 network error。

#### Expected

```text
手动 Stop 后最终应保存 partial run 并能进入 Analysis；等待期间最好不要产生用户可见或控制台噪声。
```

#### Actual

```text
1. Run / Analysis 功能最终成功：API 后续返回 200，Run Result 和 Analysis 页面均可读取 142 帧 partial run。
2. 浏览器控制台仍记录了 5 条短暂 404：`GET /api/runs/run-golden_a_20260522_dev_lab-20260606T003329001161Z`。
```

#### Suspected cause

前端 `waitForStoppedRun()` 在 stream abort 后轮询 run API；后端 generator 的 `finally` 需要一点时间写入 `stream_closed` run，前几次查询可能先于落盘。

#### Fix summary

2026-06-06:

```text
1. RunStore 新增 run_manifest_path()、analysis_result_path()、run_availability()，用于判断 partial run 的 manifest 和 analysis 是否均已落盘。
2. API 新增 GET /api/runs/{run_id}/availability，返回 manifest_exists、analysis_exists、exists。
3. 前端 waitForStoppedRun() 改为先轮询 availability；只有 exists=true 时才请求 /api/runs/{run_id}。
4. 正常 Stop 等待期间不再主动请求尚未落盘的 run，从而避免控制台中短暂 404 噪声。
```

#### Tests run

```text
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_api.py::test_run_availability_endpoint_avoids_404_polling_noise -q
Result: PASS, 1 passed

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_api.py backend/tests/integration/test_live_offline_run_service.py -q
Result: PASS, 9 passed

npm test --prefix frontend
Result: PASS, 6 passed

npm run build --prefix frontend
Result: PASS
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:4173/`
- Backend URL: `http://127.0.0.1:8031/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps: 在浏览器中挂载 fetch 状态日志；启动 Live Offline full run；等待进入 100+ 帧后点击 Stop；等待 partial run 写入并读取 Run Result。
- Expected: 页面显示 partial run result 和 analysis；Stop 等待期间 `/api/runs/{run_id}` 不产生 404。
- Actual: partial run `run-golden_a_20260522_dev_lab-20260606T133058696871Z` 保存 126 帧并显示 Run Result；fetch 日志中 `/api/runs/.../availability` 为 3 次 HTTP 200，最终 `/api/runs/{run_id}` 为 HTTP 200，`badRunRequestCount=0`。
- Result: PASS
- Evidence: `output/playwright/p0023_stop_no_404_retest.png`, `output/playwright/p0023_stop_fetch_eval.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0024 — A 类 3804 帧 ROI 内游离脏点被纳入 mesh_region 并决定外包络 max-width

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, `BalloonEnvelopeDetector`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

用户指出 `golden_a_20260522_dev_lab` 约 3804 帧处，ROI 右下侧游离脏点进入 ROI 后被识别为 A 类整体外包络，导致黄色外包络投影框和 A/B 测量线向右下角拉长。

复现 ROI：

```text
center_x=1118.07
center_y=465.16
width=1269.76
height=381.92
angle_deg=-21.49
```

#### Expected

```text
外部 speck / 小黑点 / 游离脏点不得成为 A 类待测物体目标。
A 类 max-width 应由网状主体整体外包络决定，不能由与主体分离的小连通域决定。
```

#### Actual

当前代码诊断：

```text
Frame 3800:
distance_px=905.0
selected row v=221
right local x=1086
right-bottom speck component #4 area=56, bbox x=1125-1138, y=372-376

Frame 3804:
distance_px=950.0
selected row v=375
right local x=1125
right-bottom speck component #4 area=125, bbox x=1125-1139, y=366-376
```

3804 中，小连通域 #4 已进入 `mesh_region target`，并在底部 envelope row 里把 98% 右侧分位数推到 local x=1125，使该行成为最大宽度候选。

#### Root cause

`_largest_mesh_region()` 先选择最大主体和相关组件，但最终用主体 bbox 加 margin 后直接执行：

```text
obj[y1:y2, x1:x2] = mask[y1:y2, x1:x2]
```

这会把 bbox/margin 内的所有 mask 像素都重新带入 `mesh_region`，包括面积低于 `min_component_area_px`、与主体分离的 speck。随后 `_mesh_envelope_rows()` 对 `mesh_region` 全体像素做 row window 分位数外包络，3804 中 speck 面积增大后越过 `envelope_quantile=0.02` 的排除能力，最终决定 max-width。

#### Evidence

```text
output/debug/p0024_speck_3800_3804/frame_3800_source_overlay.png
output/debug/p0024_speck_3800_3804/frame_3804_source_overlay.png
output/debug/p0024_speck_3800_3804/frame_3800_roi_diagnostics.png
output/debug/p0024_speck_3800_3804/frame_3804_roi_diagnostics.png
output/debug/p0024_speck_3800_3804/frame_3800_right_bottom_zoom.png
output/debug/p0024_speck_3800_3804/frame_3804_right_bottom_zoom.png
output/debug/p0024_speck_3800_3804/summary.json
output/debug/p0024_speck_3800_3804/row_width_zoom_summary.json
```

#### Fix summary

2026-06-06 已修复。

`backend/src/yyt1771_g3/vision/detectors.py` 的 `_largest_mesh_region()` 现在在连通域筛选时记录每个 component 的 label，并且最终只保留已经通过同主体判定的 related component label：

```text
obj[labels == component["label"]] = True
```

不再使用主体 bbox + margin 后的整块 mask 回填，因此面积较小、与主体分离的右下游离脏点不会重新进入正式 `mesh_region`。

新增回归测试：

```text
backend/tests/integration/test_golden_detector_smoke.py::test_golden_a_roi_speck_does_not_expand_3804_envelope
```

修复后诊断：

```text
Frame 3800:
distance_px=905.0
mesh_right_local_px=1086.0
right-bottom speck component #4 area=56, in_target=false

Frame 3804:
distance_px=904.0
mesh_right_local_px=1085.0
right-bottom speck component #4 area=125, in_target=false
```

修复后诊断证据：

```text
output/debug/p0024_speck_3800_3804_fixed/frame_3800_source_overlay.png
output/debug/p0024_speck_3800_3804_fixed/frame_3804_source_overlay.png
output/debug/p0024_speck_3800_3804_fixed/frame_3800_roi_diagnostics.png
output/debug/p0024_speck_3800_3804_fixed/frame_3804_roi_diagnostics.png
output/debug/p0024_speck_3800_3804_fixed/frame_3800_right_bottom_zoom.png
output/debug/p0024_speck_3800_3804_fixed/frame_3804_right_bottom_zoom.png
output/debug/p0024_speck_3800_3804_fixed/summary.json
```

#### Tests run

```bash
PYTHONPATH=backend/src python3 - <<'PY'
# Used current detector functions to run frames 3800 and 3804 with the ROI above,
# export source overlays, ROI mask diagnostics, zoom crops, and JSON summaries.
PY
Result: PASS, diagnostic artifacts generated.

PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_golden_detector_smoke.py::test_golden_a_roi_speck_does_not_expand_3804_envelope backend/tests/integration/test_golden_detector_smoke.py::test_golden_a_bubble_frames_do_not_use_cross_row_mesh_span backend/tests/integration/test_golden_detector_smoke.py::test_golden_a_split_mesh_components_are_measured_as_one_body backend/tests/unit/test_envelope_detectors.py -q
Result: PASS, 9 passed in 2.74s.

PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q
Result: PASS, 68 passed in 4.52s.

npm test
Result: PASS, 4 passed.

npm run build
Result: PASS, vite build completed.
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5178/`
- Backend URL: `http://127.0.0.1:8024/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Playback
- Steps:
  1. 选择 `golden_a_20260522_dev_lab`。
  2. 切换到 Playback。
  3. 设置 ROI：`center_x=1118.07`, `center_y=465.16`, `width=1269.76`, `height=381.92`, `angle_deg=-21.49`。
  4. Probe frame 3800。
  5. Probe frame 3804。
- Expected: 3804 帧游离脏点不得进入正式外包络；distance 应保持在主体宽度约 904-905px，而不是修复前 950px。
- Actual: frame 3800 为 `VALID`, `Distance=905.00 px`；frame 3804 为 `VALID`, `Distance=904.00 px`；overlay 显示 A/B 仍落在网状主体外包络上。
- Result: PASS
- Evidence:
  - `output/playwright/p0024_playback_frame3800_fixed.png`
  - `output/playwright/p0024_playback_frame3804_fixed.png`

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5178/`
- Backend URL: `http://127.0.0.1:8024/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps:
  1. 在 Playback 中保持同一 ROI 和 frame 3804。
  2. 设置温控目标温度 `10.00 °C`，使 Run 在 3804 首帧达到目标温度后自动停止。
  3. 切换到 Run，点击 `Start full offline run`。
- Expected: Run 状态使用同一检测逻辑，frame 3804 的实时 distance 不被右下游离脏点拉大。
- Actual: Run 页面显示 `Progress=1 / 1`, `Current frame=3,804`, `Distance=904.00 px`, `Temperature=10.00 °C`, `Sync=TEMP_SYNC_INTERPOLATED`；overlay 显示 `L=904.0px`。
- Result: PASS
- Evidence:
  - `output/playwright/p0024_run_frame3804_target_stop_fixed.png`
  - `output/runs/run-golden_a_20260522_dev_lab-20260606T065948848041Z/run_manifest.json`

#### Final status

RESOLVED_BROWSER_VERIFIED

### P-0025 — 未设置目标温度的长时间 Run stream 在 Playwright 复测中可导致 target crashed

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P2
- Module: `frontend/src/main.tsx`, live offline run streaming
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

复测 P-0024 时，使用 Playwright MCP 在 Run 页面从 frame 3804 启动未设置目标温度的 full offline stream，浏览器目标页两次出现 `Target crashed` / DOM 读取超时。

#### Expected

```text
长时间 Run stream 不应导致浏览器页面或自动化 target 崩溃。
```

#### Actual

```text
第一次：Run 页面点击 Start full offline run 后，Playwright browser_click 等待 120s 超时，随后页面 target crashed。
第二次：使用 DOM click 启动 stream 后，读取 main.innerText 超时，随后页面 target crashed。
```

后端日志显示 stream 请求已经进入并至少处理过 frame 3804-3812；非流式 Run API 和设置目标温度的短 Run 浏览器复测均可正常通过。

#### Suspected cause

已确认主要风险来自长时间 NDJSON stream 的每帧 payload 压力：旧实现会在每个 frame event 内携带随帧数增长的完整 AFAS preprocessing / analysis arrays。长跑到数千帧时，浏览器自动化 target 和页面内存压力显著增加。

#### Evidence

```text
Backend log showed:
POST /api/live-offline-runs/stream 200 OK
GET /api/offline-datasets/golden_a_20260522_dev_lab/frames/3804.png?max_width=1024 200 OK
...
GET /api/offline-datasets/golden_a_20260522_dev_lab/frames/3812.png?max_width=1024 200 OK
```

#### Fix summary

2026-06-06: 已修复。`backend/src/yyt1771_g3/services/live_offline_run_service.py` 的 frame event 改为只发送轻量 AFAS preview/status：

```text
afas_preprocessing.preview_status = deferred_until_complete
afas_preprocessing.point_count = processed_frames
afas_analysis.result_status = pending
```

完整 AFAS 结果仍保存在 final `complete` event 和落盘 `analysis_result.json` 中，避免每帧 payload 随帧数线性增长。

#### Tests run

```bash
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_service.py -q
Result: PASS, 6 passed.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_api.py::test_live_offline_run_stream_api_emits_frame_events_and_final_run -q
Result: PASS.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests tests -q
Result: PASS, 78 passed.
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5178/`
- Backend URL: `http://127.0.0.1:8024/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps: frame 3804 起始，未设置目标温度，点击 `Start full offline run`。
- Expected: 页面持续显示 live frame / distance / temperature 并可 Stop。
- Actual: Playwright target crashed；后端 stream 已处理部分帧。
- Result: FAIL
- Evidence: backend uvicorn log in current Codex session.

#### Browser retest log 2

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8026/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Setup / Live offline stream
- Steps:
  1. 在浏览器页面上下文触发 A 图示 ROI，无目标温度，读取 NDJSON stream 至 complete。
  2. 在浏览器页面上下文触发 C 图示 ROI，无目标温度，读取 NDJSON stream 至 complete。
  3. 检查 browser status、run manifest 和 detector audit。
- Expected: 无目标温度长时间 stream 完成所有帧，不出现 target crashed；run manifest 正常落盘。
- Actual:
  - A: `run-golden_a_20260522_dev_lab-20260606T121053788653Z`, `5807/5807` frames, browser status `complete`。
  - C: `run-golden_c_20260529_dev_lab-20260606T123948034895Z`, `8623/8623` frames, browser status `complete`。
  - 两次 run 均未出现 target crashed。
- Result: PASS
- Evidence:
  - `output/playwright/p0030_browser_full_run_evidence.png`
  - `output/runs/run-golden_a_20260522_dev_lab-20260606T121053788653Z/run_manifest.json`
  - `output/runs/run-golden_c_20260529_dev_lab-20260606T123948034895Z/run_manifest.json`
  - `output/audits/p0030-browser-full-runs/combined_browser_full_run_summary.json`

#### Final status

RESOLVED_BROWSER_VERIFIED

### P-0029 — 系统 Python 的 OpenCV wheel 与 NumPy 2.x ABI 不兼容，归档脚本无法 import cv2

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `local env`, `/Users/lulingfeng/Documents/工作/开发/归档`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

使用系统 `python3` 运行依赖 OpenCV 的归档脚本时，`import cv2` 失败。

#### Expected

```text
系统 python3 和项目 .venv/bin/python 均可正常导入 cv2，并能运行归档网格类/线束类脚本的基础 OpenCV 流程。
```

#### Actual

```text
python3 -> /Users/lulingfeng/miniforge3/bin/python3
NumPy -> 2.4.3
cv2 import failed:
ImportError: numpy.core.multiarray failed to import
AttributeError: _ARRAY_API not found

原因：base 环境中 OpenCV wheel 版本不一致且过旧：
opencv-python 4.6.0.66
opencv-python-headless 4.11.0.86
opencv-contrib-python 4.10.0.84
```

#### Suspected cause

已确认根因是系统 Python base 环境中的 OpenCV wheel 与 NumPy 2.x ABI 不匹配；多个 OpenCV wheel 同时安装也会使 `cv2` 目录互相覆盖，放大不确定性。

#### Fix summary

将系统 `python3` 所在 Miniforge base 环境的三套 OpenCV wheel 统一升级到 `4.13.0.92`：

```bash
python3 -m pip install --upgrade opencv-python opencv-python-headless opencv-contrib-python
```

修复后系统 `python3` 版本状态：

```text
numpy 2.4.3
opencv-python 4.13.0.92
opencv-python-headless 4.13.0.92
opencv-contrib-python 4.13.0.92
cv2 4.13.0
```

2026-06-06 追加可复现环境防护：

```text
1. 新增 backend/requirements.txt，固定项目后端依赖范围，并将 opencv-python 固定为 4.13.0.92、NumPy 限制为 >=2.0,<2.5。
2. README_使用说明.md 的安装步骤改为 python -m pip install -r backend/requirements.txt。
3. README_使用说明.md 增加 OpenCV / NumPy 兼容性检查、系统 python3 修复命令和 .venv 优先使用说明。
```

#### Tests run

```bash
python3 - <<'PY'
import sys
import numpy as np
import cv2
print('exe', sys.executable)
print('numpy', np.__version__, np.__file__)
print('cv2', cv2.__version__, cv2.__file__)
img = np.zeros((32, 32), dtype=np.uint8)
img[8:24, 10:20] = 255
_, mask = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY)
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
print('contours', len(contours), 'area', cv2.contourArea(contours[0]) if contours else None)
PY
Result: PASS, system python3 imported cv2 4.13.0 and found 1 contour.

.venv/bin/python - <<'PY'
import numpy as np
import cv2
print('numpy', np.__version__)
print('cv2', cv2.__version__)
PY
Result: PASS, project .venv still imported cv2 4.13.0.

python3 '/Users/lulingfeng/Documents/工作/开发/归档/网格类/mesh_width_measure.py' output/env_check/mesh.png --debug-dir output/env_check/mesh_debug --csv output/env_check/mesh.csv --json output/env_check/mesh.json
Result: PASS, wrote mesh debug PNG/CSV/JSON.

python3 '/Users/lulingfeng/Documents/工作/开发/归档/线束类/wire_bundle_measure.py' output/env_check/wire_seq --output-dir output/env_check/wire_out --no-frame-images
Result: PASS, wrote wire CSV/GIF.

python3 -m pip check
Result: PARTIAL, OpenCV conflict is fixed; unrelated pre-existing base environment dependency conflicts remain.

.venv/bin/python -m pip install -r backend/requirements.txt
Result: PASS, requirements file installs successfully; pyserial 3.5 was added for the lazy real temperature serial adapter.

.venv/bin/python -m pip check
Result: PASS, project virtualenv has no broken requirements.

python3 '/Users/lulingfeng/Documents/工作/开发/归档/网格类/mesh_width_measure.py' output/env_check/mesh.png --debug-dir output/env_check/mesh_debug_rerun --csv output/env_check/mesh_rerun.csv --json output/env_check/mesh_rerun.json
Result: PASS, archived mesh script rerun completed with width=124.98px.

python3 '/Users/lulingfeng/Documents/工作/开发/归档/线束类/wire_bundle_measure.py' output/env_check/wire_seq --output-dir output/env_check/wire_out_rerun --no-frame-images
Result: PASS, archived wire script rerun completed with 3 frames and stable raw/smooth length=112.00px.
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: N/A
- OS: macOS
- Frontend URL: N/A
- Backend URL: N/A
- Dataset: synthetic OpenCV smoke inputs under `output/env_check`
- Page: N/A
- Steps: Import `cv2`, run threshold/findContours smoke, run archived mesh and wire scripts on synthetic images.
- Expected: No `cv2`/NumPy ABI import failure; archived scripts complete and write outputs.
- Actual: All OpenCV import and archived script smoke checks passed. `python3 -m pip check` still reports unrelated existing base environment dependency conflicts, including langchain/numba/magic-pdf constraints.
- Result: PASS for this OpenCV/NumPy issue.
- Evidence:
  - `output/env_check/mesh.csv`
  - `output/env_check/mesh.json`
  - `output/env_check/mesh_debug/mesh.overlay.png`
  - `output/env_check/wire_out/theta_0deg_wire_width.csv`
  - `output/env_check/wire_out/theta_0deg_wire_box_overlay.gif`

#### Final status

RESOLVED_BROWSER_VERIFIED


### P-0030 — A/C 图示 ROI 需采用归档前处理 + G3 稳定支撑列/同窗口 A/B 规则并全帧浏览器审计

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, `backend/src/yyt1771_g3/services/live_offline_run_service.py`, `backend/src/yyt1771_g3/services/detector_audit.py`, `scripts/audit_golden_detector_stability.py`
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

用户确认 A/C 检测应采用“归档前处理思想 + 当前 G3 稳定支撑列 + 同窗口正式 A/B 规则”，并要求按图示 ROI 用真实浏览器跑完两组离线素材，逐帧检查是否仍会发生脏东西、气泡、背景 speck、C 类支撑列短断裂等导致的轮廓/外包络误判。

#### Expected

```text
1. A 类使用归档网格类前处理，正式 distance 来自同一 selected row/window 的左右整体外包络。
2. C 类使用归档线束类前处理，并使用 G3 稳定支撑列逻辑，避免短断裂或低支撑边缘 run 造成 distance 跳动。
3. Live offline stream 不应因每帧携带完整 AFAS 增长数组导致浏览器长跑崩溃。
4. A 图示 ROI 全 5807 帧、C 图示 ROI 全 8623 帧均应由真实浏览器触发 run。
5. 审计应覆盖 INVALID、VALID_WITHOUT_DISTANCE、A 同窗口规则、C stable_support_columns 模式和相邻 distance 大跳。
6. 外部 speck/脏东西不得成为正式外包络；如有异常应登记并继续修复。
```

#### Actual

修复前的风险点：

```text
1. C 类支撑列可能因约 13px 短间隔或低支撑边缘 run 分裂，导致 5119-5165 及后续部分区间 distance 抖动。
2. Live offline stream 每帧携带持续增长的完整 AFAS 预处理/分析数组，长时间浏览器 run 有 target crash 风险。
3. 缺少一个可复用的 run manifest 审计器来逐帧检查 A/C 正式规则。
```

#### Suspected cause

C 类错误跳动的根因是支撑列 run 合并窗口偏小，且低支撑边缘 run 未先过滤；A 类外部 speck 风险需要通过同窗口正式 A/B 规则和全帧审计确认。浏览器长跑风险来自每帧 NDJSON payload 随帧数增长。

#### Fix summary

```text
1. C 类 stable_support_columns 合并 gap 从仅 wire_box_padding_px 调整为 wire_box_padding_px + half support smooth window，并过滤低支撑 raw run。
2. C 类 debug 增加 wire_support_merge_gap_px、wire_support_min_run_score、wire_support_filtered_run_count。
3. Live offline stream 每帧只发送轻量 AFAS preview/status，完整 AFAS 保留在 complete event 和落盘 analysis_result。
4. 新增 detector_audit 服务，检查 INVALID、distance 缺失、相邻大跳、A 同窗口 distance、C stable_support_columns 模式。
5. 新增 scripts/audit_golden_detector_stability.py，内置 A/C 图示 ROI preset，使用 dataset id 和 registry 运行全帧审计。
```

#### Tests run

```bash
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_service.py -q
Result: PASS, 6 passed.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_api.py::test_live_offline_run_stream_api_emits_frame_events_and_final_run -q
Result: PASS.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/unit/test_detector_audit.py -q
Result: PASS.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_golden_detector_smoke.py -q
Result: PASS.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests tests -q
Result: PASS, 78 passed.

npm test --prefix frontend
Result: PASS, 6 passed.

npm run build --prefix frontend
Result: PASS.
```

#### Full-frame audit log

- A script audit:
  - Dataset: `golden_a_20260522_dev_lab`
  - ROI: `center_x=1118.07`, `center_y=465.16`, `width=1269.76`, `height=381.92`, `angle_deg=-21.49`
  - Run: `run-golden_a_20260522_dev_lab-20260606T114912395527Z`
  - Frames: `5807`
  - Errors: `0`
  - Warnings: `3`
  - Distance: `800.0..999.8199999999997`
  - Warning frames: `1676`, `2507`, `3186`; all are `LARGE_ADJACENT_DISTANCE_JUMP` only, and debug shows `contour_measurement_mode=archived_mesh_envelope_rows` plus `mesh_selected_row_width_px == distance_px`, so not a speck/脏点误识别。
  - Evidence: `output/audits/p0030-full-detector-stability-a-final/a_figure_roi_summary.json`

- C script audit:
  - Dataset: `golden_c_20260529_dev_lab`
  - ROI: `center_x=1062.83`, `center_y=650.7`, `width=763.35`, `height=1020.38`, `angle_deg=-7.31`
  - Run: `run-golden_c_20260529_dev_lab-20260606T112753215134Z`
  - Frames: `8623`
  - Errors: `0`
  - Warnings: `0`
  - Distance: `150.99999999999977..368.0000000000001`
  - Evidence: `output/audits/p0030-full-detector-stability-c-final/c_figure_roi_summary.json`

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8026/`
- Dataset: `golden_a_20260522_dev_lab`, `golden_c_20260529_dev_lab`
- Page: Setup / Live offline stream
- Steps:
  1. 在浏览器页面上下文触发 A 图示 ROI live offline stream，全帧读取 NDJSON frame event 至 complete。
  2. 在浏览器页面上下文触发 C 图示 ROI live offline stream，全帧读取 NDJSON frame event 至 complete。
  3. 对两个浏览器 run manifest 执行 detector audit，检查 A/C 正式规则和相邻大跳。
  4. 截图保存 A 3804 probe overlay 与 A/C full-run 状态证据。
- Expected: A/C 两组素材全部帧完成；没有 INVALID 或正式规则 error；A 类脏点不拉动正式 A/B；C 类 2614/2615、5119-5165 等区间不再出现支撑列误判大跳。
- Actual:
  - A browser run: `run-golden_a_20260522_dev_lab-20260606T121053788653Z`, `5807/5807` frames, `valid=5807`, `invalid=0`, `errors=0`, `warnings=3`, distance `800.0..999.8199999999997`。
  - C browser run: `run-golden_c_20260529_dev_lab-20260606T123948034895Z`, `8623/8623` frames, `valid=8623`, `invalid=0`, `errors=0`, `warnings=0`, distance `150.99999999999977..368.0000000000001`。
  - A 3804 probe overlay 显示右下脏点未进入黄色正式 A/B 投影。
  - 手动第一次 C stream 请求曾因测试脚本使用旧字段 `measurement` 而返回 422；改为当前 API 字段 `measurement_definition` 后浏览器 full run 正常完成，不属于产品代码缺陷。
- Result: PASS
- Evidence:
  - `output/playwright/p0030_browser_full_run_evidence.png`
  - `output/audits/p0030-browser-full-runs/a_browser_full_run_summary.json`
  - `output/audits/p0030-browser-full-runs/a_browser_full_run_flagged_frames.csv`
  - `output/audits/p0030-browser-full-runs/c_browser_full_run_summary.json`
  - `output/audits/p0030-browser-full-runs/c_browser_full_run_flagged_frames.csv`
  - `output/audits/p0030-browser-full-runs/combined_browser_full_run_summary.json`
  - `output/runs/run-golden_a_20260522_dev_lab-20260606T121053788653Z/run_manifest.json`
  - `output/runs/run-golden_c_20260529_dev_lab-20260606T123948034895Z/run_manifest.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0031 — A 类 Setup 诊断框与归档 closed contour 显示口径不同，ROI 角度变化时容易误解为轮廓未包全

- Status: OPEN
- Priority: P1
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, Setup overlay, archive comparison
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

用户对比 `golden_a_20260522_dev_lab` frame 1 的 3 个 ROI 角度截图时指出：图 1/2 的黄色诊断框看起来没有把待测物体整体都包进去，图 3 只改变 ROI 角度后似乎包得更完整。需要确认当前 G3 与 `/Users/lulingfeng/Documents/工作/开发/归档` 中网格类 / 线束类轮廓方式是否一致。

#### Expected

```text
1. G3 应清楚区分正式 distance 使用的同一 selected row/window A/B、投影诊断框、归档 closed contour/fill 诊断轮廓。
2. 如果 UI 显示“轮廓”，不应让操作者误以为黄色 projection box 就是完整外包络闭合轮廓。
3. 若需要判断 mask 是否真正包住整体，应提供 outer_contour / filled_contour 诊断层或等价可视化。
```

#### Actual

```text
当前 G3 A 类 Setup overlay 显示的是 contour_projection_box / contour_direction_arrow / theta/L。
该黄色框来自 G3 同一 selected row/window 的投影范围，不是归档 mesh_width_measure.py 的 closed contour 或 filled contour。
在用户截图中的 ROI 角度下，G3 正式距离比归档网格类跨行 min/max 或 closed contour bbox 略小，因此视觉上更像“没有包全”。
```

#### Comparison evidence

```text
Audit command:
PYTHONPATH=backend/src .venv/bin/python scripts/audit_roi_angle_archive_compare.py

ROI fig1 angle -4.05:
G3 selected-row distance = 1006.0 px; G3 debug global span = 1053.0 px.
Archive mesh width = 1071.692 px; archive contour bbox width = 1074.0 px.

ROI fig2 angle -12.28:
G3 selected-row distance = 1022.0 px; G3 debug global span = 1032.0 px.
Archive mesh width = 1050.0 px; archive contour bbox width = 1054.0 px.

ROI fig3 angle -11.28:
G3 selected-row distance = 1030.5 px; G3 debug global span = 1032.0 px.
Archive mesh width = 1051.0 px; archive contour bbox width = 1054.0 px.
```

Evidence files:

```text
output/audits/p0031_roi_angle_archive_compare/summary.json
output/audits/p0031_roi_angle_archive_compare/fig1_angle_minus_4_05_overlay.png
output/audits/p0031_roi_angle_archive_compare/fig2_angle_minus_12_28_overlay.png
output/audits/p0031_roi_angle_archive_compare/fig3_angle_minus_11_28_overlay.png
```

#### Current interpretation

```text
1. 归档网格类也不是把所有真实物体完整实心化后作为正式 distance；正式宽度由 row-window 外包络计算。
2. 归档网格类额外生成 closed contour / filled contour 诊断图，因此视觉上可能比 G3 当前黄色 projection box 更像“包住整体”。
3. G3 当前为避免不同 row/window 左右边界拼接、脏点/气泡/支撑丝拉长，正式 distance 使用同一 selected row/window；这会比归档跨行 min/max 或 contour bbox 更保守。
4. 归档线束类是另一套 C 类序列算法，含 temporal mask stabilization 和 rolling median；不能直接用于 A 类网格截图判断。
```

#### Final status

OPEN


---

### P-0032 — A 类当前 ROI 下归档网格类跨 row 宽度也会产生尖峰，不宜直接替换 G3 正式 distance

- Status: OPEN
- Priority: P1
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, archive comparison, curve stability
- Found date: 2026-06-06
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户在 Run 页面使用 `golden_a_20260522_dev_lab`、约 `theta=-12.5 deg` 的 A 类 ROI 时看到 temperature-distance 曲线存在局部波动，询问是否用 `/Users/lulingfeng/Documents/工作/开发/归档` 的网格类方式跑同一数据也会波动。

#### Expected

```text
若归档算法更稳定，应在同一 ROI / 同一帧段下减少局部 distance 尖峰。
若归档算法也波动，应作为证据说明不能直接把归档跨 row/global span 宽度替换为 G3 正式 distance。
```

#### Actual

```text
在截图角度重建 ROI:
center_x=1206.8, center_y=693.4, width=1196.78, height=925.47, angle_deg=-12.5。

采样帧:
560-5807，每 25 帧稀疏采样；560-760、3400-3600、3760-3820 连续逐帧采样，共 657 帧。

结果:
2-3°C: G3 range=15 px, max adjacent jump=3 px；archive mesh width range=23 px, max adjacent jump=10 px。
9-10°C: G3 range=29 px, max adjacent jump=2 px；archive mesh width range=66 px, max adjacent jump=46 px。
关键帧 3538/3554: G3 948 -> 947 px；archive 974 -> 974 px，截图附近本身没有大跳。
归档大跳示例:
3450 -> 3451: archive 1026 -> 980 px；G3 954 -> 954 px。
3761 -> 3762: archive 960 -> 1006 px；G3 934 -> 934 px。
```

#### Suspected cause

```text
归档 mesh_width_measure.py 的正式 width 使用 kept row windows 的 min(row.left) 与 max(row.right) 跨 row 拼接。
当相邻帧中某些 row-window 被保留/剔除发生变化时，global left/right 会改变，从而产生尖峰。
G3 当前同一 selected row/window 的正式 A/B 规则在这些帧上更保守，因此没有同步出现同样尖峰。
```

#### Evidence

```text
Audit command:
PYTHONPATH=backend/src .venv/bin/python scripts/audit_archive_mesh_curve_compare.py

Artifacts:
output/audits/p0032_archive_mesh_curve_compare/summary.json
output/audits/p0032_archive_mesh_curve_compare/screenshot_angle_minus_12_50/summary.json
output/audits/p0032_archive_mesh_curve_compare/screenshot_angle_minus_12_50/curve_compare.csv
output/audits/p0032_archive_mesh_curve_compare/screenshot_angle_minus_12_50/curve_compare.png
output/audits/p0032_archive_mesh_curve_compare/screenshot_angle_minus_12_50/key_overlays/frame_3450_overlay.png
output/audits/p0032_archive_mesh_curve_compare/screenshot_angle_minus_12_50/key_overlays/frame_3451_overlay.png
output/audits/p0032_archive_mesh_curve_compare/screenshot_angle_minus_12_50/key_overlays/frame_3761_overlay.png
output/audits/p0032_archive_mesh_curve_compare/screenshot_angle_minus_12_50/key_overlays/frame_3762_overlay.png
```

#### Current interpretation

```text
归档网格类不应直接整体替换 G3 当前正式 distance 口径。
更安全的方向是：保留归档前处理和 closed/fill contour 作为诊断层；正式 distance 继续使用同一 selected row/window，并可考虑增加 row-window 时间稳定约束或把 archive global width 作为辅助诊断曲线。
```

#### Additional investigation — 2026-06-08 screenshot ROI local increase

用户反馈 Run 页面在如下设置下出现温度升高但 distance 同步升高：

```text
dataset_id = golden_a_20260522_dev_lab
start_frame = 616
ROI = center_x 1139.42, center_y 719.16, width 1269.76, height 746.43, angle_deg -14.05
detector = BalloonEnvelopeDetector
width_mode = max_width
```

按截图 ROI 用后端正式 detector 重算 frame 616-730，确认该现象来自后端 raw DetectionResult，而不是前端单独连线或温度同步：

```text
frame 616: T=2.4958°C, distance=1006.0px, selected row v=512.0, left=153.0, right=1159.0
frame 706: T=3.0000°C, distance=1019.7px, selected row v=511.0, left=138.3, right=1158.0
frame 707: T=3.0299°C, distance=1005.0px, selected row v=211.0, left=181.0, right=1186.0
```

0.05°C 温度 bin 中位数显示 2.50-3.00°C 局部上升：

```text
2.50°C median=1005.00px
2.70°C median=1007.00px
2.80°C median=1011.00px
2.90°C median=1014.00px
3.00°C median=1018.00px
3.05°C median=1005.00px
```

当前判断：

```text
1. 截图中红框内的上升是真实进入后端 formal temperature-distance raw points 的检测结果。
2. 上升主要来自左侧 local boundary 从约 153px 漂到约 138px，右侧边界基本保持 1158-1161px。
3. frame 707 的 row/window 从下侧主体行 v≈511 切到上侧主体行 v=211，distance 立即回落，说明 A 类当前 row-window 选择仍缺少足够的时间稳定/物理单调约束。
4. 该 ROI 高度较大，包含底部连接丝/夹持结构，不符合“ROI 只框有效测量主体，不包含连接丝、夹具”的推荐规则，会放大 row-window 候选切换风险。
```

证据：

```text
output/investigations/p0032_screenshot_roi_temperature_distance_20260608/frame_616_overlay.png
output/investigations/p0032_screenshot_roi_temperature_distance_20260608/frame_706_overlay.png
output/investigations/p0032_screenshot_roi_temperature_distance_20260608/frame_707_overlay.png
output/investigations/p0032_screenshot_roi_temperature_distance_20260608/frame_730_overlay.png
```

#### Final status

OPEN


---

### P-0033 — Analysis AFAS 切线导数因近重复插值温度爆炸，导致 Run/Analysis 曲线不一致

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/services/afas_analysis.py`, `frontend/src/curves.ts`, Analysis UI
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

用户反馈 `golden_a_20260522_dev_lab` Run 页面曲线正常，但 Analysis 页面曲线与 Run 完全不同，截图中 Analysis y 轴被拉到约 `500000`，平滑曲线被压到接近零线，切线主导了图表。

复现场景：

```text
Run ID:
run-golden_a_20260522_dev_lab-20260606T151437470081Z

Artifacts:
output/runs/run-golden_a_20260522_dev_lab-20260606T151437470081Z/run_manifest.json
output/runs/run-golden_a_20260522_dev_lab-20260606T151437470081Z/analysis_result.json
```

#### Expected

```text
Run 和 Analysis 均应使用 backend 产生的 formal temperature-distance 数据与 AFAS 预处理结果。
Analysis 应参照 yyt1771_starter 的分析流程和图表方式：
1. 按温度分组。
2. rolling median / MAD 修复尖峰。
3. Savitzky-Golay 平滑。
4. 在平滑曲线上做导数、最大斜率、低/高温基线、切线和 As/Af-tan。
5. 图表 y 轴应以真实曲线值为主，不应被异常切线端点拖到远离 measured/smoothed distance 的量级。
```

#### Actual

```text
analysis_result.json:
raw=5805, grouped=778, smoothed=778
smoothed distance range ≈ 818.42..1020.06 px
temperature range ≈ 1.2..15.0 °C
AFAS result_status=ok
tangent slope=-37881.907824974274 px/°C
tangent intercept=413666.8509110991
As=10.894245090419936
Af_tan=10.895977627044898

局部温度间隔:
10.89581993569132 -> 10.895833333333334
delta ≈ 1.2e-05 °C
对应 distance 约 912.406 -> 911.897 px，导致 np.gradient 计算出异常大导数。
```

#### Suspected cause

```text
G3 已接近 starter 的 AFAS 流程，但 starter 示例数据主要是离散/重复温度；G3 live/offline run 使用插值温度，存在近乎相等但不完全相等的小数温度。
当前 group_by_temperature 使用 np.unique 精确分组，无法合并这些近重复温度。
compute_derivative 直接使用 np.gradient(values, temperatures)，微小温差会生成有限但极大的导数。
frontend CurveView 又把切线和 marker 的 y 值放入 y 轴范围，异常切线进一步把曲线显示压扁。
```

#### Fix summary

```text
1. backend/src/yyt1771_g3/services/afas_analysis.py
   - AFAS preprocessing schema 更新为 g3_afas_preprocessing.v0.2。
   - group_by_temperature 新增 0.01 °C bin 合并，避免插值温度中“近乎相等但不完全相等”的小数被当成独立温度点。
   - AFAS analysis schema 更新为 g3_afas_tangent_analysis.v0.2。
   - compute_derivative 新增 min_derivative_temperature_step_celsius=0.01 °C 防护；相邻温度间距低于阈值的导数点置为 NaN，find_max_slope_index 不再选中这些异常导数。
2. frontend/src/curves.ts
   - CurveView y 轴域改为由 measured/smoothed curve 和 raw reference points 决定，切线/marker 不再扩张 y 轴。
   - overlay line 按当前 y 轴域裁剪；超出真实曲线量级的 marker 隐藏。
3. frontend/src/main.tsx
   - 手动 Stop 后若 streaming partial run 没有及时落盘，前端使用已处理帧数通过批处理接口重新生成 stopped run，并回填完整 Analysis，避免 Analysis 停在 pending。
4. frontend/tests/curveSpecs.test.mjs 与 backend/tests/unit/test_analysis_service.py
   - 新增近重复插值温度导数回归测试。
   - 新增异常切线不能污染 y 轴的前端图表回归测试。
```

重算原问题 run 后：

```text
Run ID:
run-golden_a_20260522_dev_lab-20260606T151437470081Z

raw=5805
grouped=471
smoothed=471
min_positive_temperature_step≈0.01 °C
smoothed distance range=818.316..1020.106 px
AFAS result_status=ok
tangent slope=-103.85243492629525 px/°C
tangent intercept=2092.568678418391
As=10.498271086188769
Af_tan=11.628541323168797
max_slope_temp=11.53
```

#### Tests run

```bash
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/unit/test_analysis_service.py::test_afas_analysis_coalesces_near_duplicate_interpolated_temperatures -q
npm test
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/unit/test_analysis_service.py backend/tests/integration/test_analysis_api.py -q
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_service.py -q
npm run build

Manual exact-run recompute:
PYTHONPATH=backend/src .venv/bin/python - <<'PY'
from yyt1771_g3.services.analysis_service import build_analysis_result
from yyt1771_g3.storage.run_store import RunStore
run_id = 'run-golden_a_20260522_dev_lab-20260606T151437470081Z'
store = RunStore()
manifest = store.read_run_manifest(run_id)
analysis = build_analysis_result(manifest)
store.write_analysis_result(analysis)
print(analysis.afas_analysis['fit']['tangent']['slope'])
PY
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: http://127.0.0.1:5176
- Backend URL: http://127.0.0.1:8022
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run, Analysis / Export
- Steps:
  1. 打开前端并选择默认 A 类 golden dataset。
  2. 进入 Run 页面，点击 Start full offline run。
  3. 等待页面实时显示 live frame、temperature-distance 曲线和坐标轴。
  4. 点击 Stop。
  5. 等待 stopped run fallback 回填完整 Analysis。
  6. 进入 Analysis / Export 页面，检查 AFAS Parameters、result panel、Smoothed distance - temperature 曲线和坐标轴。
- Expected:
  - 手动停止后 Analysis 不停留在 pending。
  - Analysis 曲线 y 轴保持在真实 distance 量级，不再出现 500000 级别坐标轴。
  - Smoothed curve 与 Run 的 distance-temperature 量级一致。
- Actual:
  - Analysis 显示 stopped run `run-golden_a_20260522_dev_lab-20260606T162327565414Z`。
  - AFAS status 为 unavailable（停止帧段温度范围太窄，符合预期），但 preprocessing/curve 正常显示。
  - 曲线 y 轴为 986/988/990 px，x 轴为 1.2/1.3/1.4 °C，没有异常切线拉伸。
- Result: PASS
- Evidence: `output/playwright/p0033_analysis_stopped_run_browser_retest.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0034 — 手动 Stop 后 streaming partial run 未落盘时 Analysis 停在 pending

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/main.tsx`, live offline run stop flow
- Found date: 2026-06-06
- Last update: 2026-06-06
- Owner/tool: Codex

#### Problem

P-0033 浏览器复测中，在 Run 页面启动 full offline run 后点击 Stop。页面进入 Analysis 后显示 stopped run id 和 partial temperature-distance 点，但提示：

```text
Run is not available yet: run-golden_a_20260522_dev_lab-20260606T161739524221Z
```

同时 AFAS status 停在 `pending`，磁盘下没有对应 run 目录。

#### Expected

```text
用户手动停止 run 后，Analysis 应可以使用已处理帧段进行分析。
若 streaming abort 后服务端没有及时写出 partial run，前端应有可恢复路径生成 stopped run 结果，而不是停在 pending。
```

#### Actual

```text
output/runs/run-golden_a_20260522_dev_lab-20260606T161739524221Z 不存在。
Analysis 页面只能显示 live state 中的 pending AFAS payload。
```

#### Suspected cause

```text
浏览器 AbortController 取消 streaming fetch 后，FastAPI StreamingResponse generator 的 finally 保存路径没有稳定产出磁盘 run。
```

#### Fix summary

```text
frontend/src/main.tsx 新增 liveRunProcessedFramesRef。
Stop 后先等待 stopped run availability；若服务端 partial run 未落盘，则用 createLiveOfflineRun(dataset_id, measurement, maxFrames=已处理帧数) 重新生成等效 stopped run，并把返回的 analysis_result 回填到 Run/Analysis 状态。
```

#### Tests run

```bash
npm test
npm run build
```

#### Browser retest log

- Retest date: 2026-06-06
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: http://127.0.0.1:5176
- Backend URL: http://127.0.0.1:8022
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run, Analysis / Export
- Steps:
  1. 进入 Run 页面。
  2. 点击 Start full offline run。
  3. 等待数秒后点击 Stop。
  4. 等待 Run Result 出现。
  5. 切换到 Analysis / Export。
- Expected: Analysis 显示 stopped run 的分析结果，不再 pending。
- Actual: Analysis 显示 `run-golden_a_20260522_dev_lab-20260606T162327565414Z`，AFAS status 为 unavailable，preprocessing/curve 已生成并显示。
- Result: PASS
- Evidence: `output/playwright/p0033_analysis_stopped_run_browser_retest.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0035 — C 类 3700 多帧左侧连续分支被 support 分组排除导致 distance 曲线跳动

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, `backend/src/yyt1771_g3/core/models.py`, C BundleEnvelopeDetector
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

用户反馈 `golden_c_20260529_dev_lab` 在约 3700 多帧时，画面可见最左侧分支属于多线束整体，但当前黄色 projection box 未包含该分支，Run 页 temperature-distance 曲线在该区域出现明显上下跳动。

用户截图 ROI 近似参数：

```text
center_x=957.6
center_y=521.73
width=547.98
height=809.52
angle_deg=-9.93
```

#### Expected

```text
C 类多细支/多线束必须视为一个整体目标。
已经通过有效线束筛选、且与主体相邻/连续出现的分支，不应作为外部 speck 或非预期物体排除。
3700-3900 附近 distance 不应在约 178 px 与 225 px 之间因 support 分组阈值来回跳变。
```

#### Actual

```text
复现命令使用上述 ROI 检测 golden_c_20260529_dev_lab。

Frame 3723:
distance=178 px
wire_support_raw_run_count=4
wire_support_filtered_run_count=2
wire_support_merged_run_count=2
selected support group=230..417
global quantile length=284 px
左侧有效 supported run=185..205，score≈2130，但因 gap=24px > 当前 merge gap=17px 被排除。

Frame 3780:
distance=225 px
selected support group=184..418
此时同类左侧 run 与主束 gap≈17px，刚好被 merge，导致曲线突然跳变。

3700-3900:
current min distance≈177 px
current max distance≈225 px
max adjacent jump≈46 px
```

#### Suspected cause

```text
_wire_stable_projection 只按 support column run 的 gap 做合并。
当前 max_gap = wire_box_padding_px + smooth_px/2，约 17px。
C 类分支在物体松开过程中会形成有意义的邻近 supported run；这些 run 分数远高于 speck，但 gap 略大于 17px 时被拆成独立物体。
当 gap 缩小到阈值内又突然合并，造成 distance 曲线尖峰/阶跃。
```

#### Fix summary

```text
1. backend/src/yyt1771_g3/core/models.py
   - DetectorConfig 新增 wire_support_merge_gap_ratio，默认 0.06。
2. backend/src/yyt1771_g3/vision/detectors.py
   - _wire_stable_projection 的 supported run 合并间隙从单纯 wire_box_padding_px + smooth_px/2，扩展为 max(base_gap, ROI local width * wire_support_merge_gap_ratio)。
   - 只对已经通过 score 过滤的 supported runs 生效；低分外部 speck/raw runs 仍在 supported_runs 阶段被剔除。
   - debug_artifacts 新增 wire_support_base_merge_gap_px 与 wire_support_continuity_merge_gap_px，便于复查合并来源。
3. backend/tests/integration/test_golden_detector_smoke.py
   - 新增 test_golden_c_user_roi_continuous_left_branch_is_part_of_bundle_envelope。
   - 覆盖用户 ROI 的 3700-3900 帧，要求左侧连续分支纳入整体 envelope，并限制相邻帧跳动。
```

修复后复现数据：

```text
Frame 3723:
distance=223 px
wire_support_merge_gap_px=33
wire_support_base_merge_gap_px=17
wire_support_continuity_merge_gap_px=33
wire_support_merged_run_count=1
wire_support_group_min_along_px=185
wire_support_group_max_along_px=417

Frame 3780:
distance=225 px
wire_support_group_min_along_px=184
wire_support_group_max_along_px=418

Frame 3885:
distance=227 px
wire_support_group_min_along_px=183
wire_support_group_max_along_px=419

3700-3900:
n=201
min distance=222 px
max distance=234 px
max adjacent jump=8 px
```

#### Tests run

```bash
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_golden_detector_smoke.py::test_golden_c_user_roi_continuous_left_branch_is_part_of_bundle_envelope -q
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/unit/test_envelope_detectors.py backend/tests/integration/test_golden_detector_smoke.py backend/tests/integration/test_live_offline_run_service.py -q
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/unit/test_analysis_service.py backend/tests/integration/test_analysis_api.py -q
npm run build
npm test
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests -q
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: http://127.0.0.1:5176
- Backend URL: http://127.0.0.1:8022
- Dataset: `golden_c_20260529_dev_lab`
- Page: Playback
- Steps:
  1. 打开前端并选择 `golden_c_20260529_dev_lab`。
  2. 进入 Playback。
  3. 设置 frame=3723。
  4. 设置 ROI: center_x=957.6, center_y=521.73, width=547.98, height=809.52, angle_deg=-9.93。
  5. 点击 Probe current frame。
- Expected:
  - 左侧连续分支纳入 C 类整体外包络。
  - distance 不再停在约 178 px。
  - overlay 显示 L≈223 px。
- Actual:
  - 状态 VALID。
  - Result distance=223.00 px。
  - overlay 标签显示 `theta=-9.9 deg L=223.0px`。
- Result: PASS
- Evidence: `output/playwright/p0035_c_left_branch_playback_probe.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0036 — P-0025 轻量流式事件回退了 Run 实时 AFAS 平滑预览

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/services/live_offline_run_service.py`, `frontend/src/main.tsx`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

用户询问当前实时状态曲线是否和 Analysis 一样做平滑，并指出 `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter` 的实时状态也有做平滑。

复查 G3 当前代码发现：P-0025 为避免长时间 stream 每帧发送完整 AFAS 大 payload 导致浏览器崩溃，将 frame event 中的 `afas_preprocessing` 改成了 `deferred_until_complete` 占位。这样虽然 final complete event 和 Analysis 页面仍有完整 AFAS smoothing，但 Run 页面实时过程中拿不到 `afas_preprocessing.smoothed`，会退回显示原始 `temperature_distance`。

#### Expected

```text
1. Run 实时曲线应与 Analysis 一样优先使用后端生成的 AFAS smoothed temperature-distance。
2. 前端不得自行作为正式平滑计算源。
3. 不得恢复每帧发送完整 raw/grouped/outlier/analysis 大数组，避免 P-0025 的长跑浏览器崩溃问题复发。
```

#### Actual

```text
backend/src/yyt1771_g3/services/live_offline_run_service.py::_frame_event 当前只发送：
afas_preprocessing.preview_status = deferred_until_complete
afas_preprocessing.point_count = processed_frames
afas_analysis.result_status = pending

frontend/src/curves.ts 虽然会优先读取 smoothed，但实时事件没有 smoothed，因此 Run 实时曲线显示 raw temperature-distance。
```

#### Suspected cause

P-0025 修复长跑崩溃时，为减小 payload 直接移除了实时 AFAS smoothing preview；没有保留“低频、轻量、仅 smoothed”的预览路径。

#### Fix summary

2026-06-07:

```text
1. backend/src/yyt1771_g3/services/live_offline_run_service.py
   - live stream 维护累计 formal temperature-distance 点。
   - 每 10 个 processed frames 生成一次后端 AFAS preprocessing preview。
   - frame event 只发送轻量字段：schema_version / parameters / smoothed / warnings / preview metadata。
   - 不发送 raw / grouped / outlier_repair / afas_analysis 大数组，避免 P-0025 的长跑崩溃风险回归。
2. frontend/src/main.tsx
   - Run 实时 analysis 收到 `smoothed` preview 时更新曲线源。
   - 中间 `unchanged` / deferred 帧保留上一份后端 smoothed preview，避免曲线在 preview 间隔内闪回 raw。
3. backend/tests/integration/test_live_offline_run_service.py
   - 新增回归测试覆盖轻量 smoothed preview。
   - 保留短 run defer preview 的轻量协议测试。
```

#### Tests run

```bash
PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_service.py::test_streamed_live_offline_run_frame_events_emit_lightweight_smoothed_afas_preview -q
Result: FAIL before fix, no frame event has preview_status=updated.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_service.py::test_streamed_live_offline_run_frame_events_emit_lightweight_smoothed_afas_preview -q
Result: PASS after fix.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_service.py::test_streamed_live_offline_run_short_frame_events_defer_afas_preview -q
Result: PASS.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests/integration/test_live_offline_run_service.py -q
Result: PASS, 7 passed.

PYTHONPATH=backend/src .venv/bin/python -m pytest backend/tests -q
Result: PASS, 77 passed.

npm test
Result: PASS, 7 passed.

npm run build
Result: PASS.
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176`
- Backend URL: `http://127.0.0.1:8022`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run / Analysis
- Steps:
  1. 打开前端并选择 `golden_a_20260522_dev_lab`。
  2. 进入 Run 页面。
  3. 点击 `Start full offline run`。
  4. 等待实时流超过 20 帧并观察 Live Curves。
  5. 点击 Stop 保存 partial run。
  6. 进入 Analysis / Export 查看同一 run。
- Expected:
  - Run 实时阶段曲线标题为 `Smoothed distance - temperature`。
  - 图中同时显示 Raw 点与 Smoothed 线。
  - Stop 后 partial run 可落盘，Analysis 页面同样显示 smoothed distance-temperature。
  - 后端 analysis payload 中存在正式 `afas_preprocessing.smoothed`。
- Actual:
  - Run 实时阶段在 96 帧时显示 `Smoothed distance - temperature`。
  - Stop 后保存 partial run `run-golden_a_20260522_dev_lab-20260606T170719467342Z`，150 frames saved，149 formal temp-distance points。
  - Analysis 页面显示 `Smoothed distance - temperature`，AFAS preprocessing `raw=149`, `grouped=9`, `smoothed=9`, `smoothed.applied=true`, `effective_savgol_window_length=7`。
- Result: PASS
- Evidence:
  - `output/playwright/p0036_run_realtime_smoothed_preview.png`
  - `output/playwright/p0036_analysis_smoothed_after_stop.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0037 — 窄温度范围曲线会生成重复 tick key 并触发 React warning

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P2
- Module: `frontend/src/main.tsx`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

P-0036 浏览器复测时，Run / Analysis 的温度范围很窄，曲线 tick 值出现重复，React 控制台持续输出：

```text
Warning: Encountered two children with the same key ... x-tick-1.4 / x-grid-1.4
```

#### Expected

曲线组件在窄温度范围、重复 tick value 或重复 tick label 时不应产生重复 React key warning。

#### Actual

`CurveView` 的 x/y tick 与 grid line key 只使用 `tick.value`，当多个 tick value 相同或格式化后相同时，会产生重复 key。

#### Suspected cause

曲线 key 未包含 tick index；tick 计算在窄范围内可能产生重复 value。

#### Fix summary

2026-06-07: `frontend/src/main.tsx` 中 `CurveView` 的 x/y grid line 和 tick group key 改为包含 tick index 与 value，例如 `x-tick-${index}-${tick.value}`，不改变曲线坐标、刻度或正式计算。

#### Tests run

```bash
npm test
Result: PASS, 7 passed.

npm run build
Result: PASS.
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5176`
- Backend URL: `http://127.0.0.1:8022`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run / Analysis
- Steps: 在 P-0036 的 Analysis 页面完成前端热更新后等待 1 秒，读取 Playwright console messages。
- Expected: 不再产生新的 duplicate key warning。
- Actual: `browser_console_messages(level="error", all=false)` 返回 Errors=0, Warnings=0。
- Result: PASS
- Evidence: Playwright console output in Codex session.

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0038 — Run 结束时缺少独立实时结果链 As/Af/AF95，与 Analysis AFAS 后处理未形成两套分析

- Status: OPEN
- Priority: P1
- Module: `backend/src/yyt1771_g3/services/live_offline_run_service.py`, `backend/src/yyt1771_g3/services/analysis_service.py`, `frontend/src/main.tsx`, `frontend/src/curves.ts`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

用户要求工程上区分两套曲线分析：

```text
1. Run 实时结果链：轻量版，用于 run 结束时快速给出 As / Af / AF95。
2. Analysis Studio AFAS 后处理链：完整工程版，包含温度分组、异常点修复、Savitzky-Golay 平滑、参数化切线分析和 As / Af-tan。
```

当前代码只确认了完整 AFAS 后处理链；Run 侧尚未发现独立的轻量 `As / Af / AF95` 结果链。

#### Expected

Run 结束或实时状态中应存在独立轻量分析结果：

```text
SyncPoint / DetectionResult formal temperature-distance 点
至少 5 个有效点
相邻点/中心差分导数
最大斜率点切线
前 N 点低温基线
后 N 点高温基线
As / Af 交点
归一化 95% 阈值插值得到 AF95
```

Analysis Studio 则继续使用完整 AFAS 后处理链：

```text
温度分组 -> 异常点修复 -> Savitzky-Golay 平滑 -> 导数 -> 最大斜率点
-> 低/高温基线 -> 中间切线 -> 三线交点 -> As / Af-tan
```

#### Actual

当前核验结果：

```text
1. backend/src/yyt1771_g3/services/analysis_service.py::build_analysis_result()
   始终调用 build_afas_postprocessing() 生成 afas_preprocessing / afas_analysis。

2. backend/src/yyt1771_g3/services/live_offline_run_service.py
   - 每帧发送 raw curve_points。
   - 每 10 帧发送一次轻量 AFAS preprocessing preview，只包含 smoothed / warnings 等预览字段。
   - frame event 中 afas_analysis 固定为 {"result_status": "pending"}。
   - complete event 写入的 analysis_result 仍来自 build_analysis_result() 的完整 AFAS 后处理。

3. 全仓库搜索未发现 AF95 / af95 / Af95 / AF_95 实现或字段。
```

因此当前工程实际是：

```text
Run 实时曲线预览 = raw formal points + 低频 AFAS smoothed preview
Run 完成结果 = 完整 AFAS analysis_result
Analysis Studio = 完整 AFAS analysis_result + 参数重算
```

尚未形成用户要求的“两套结果分析”：`Run lightweight As/Af/AF95` 与 `Analysis AFAS As/Af-tan`。

#### Suspected cause

P-0022 / P-0036 已把 Run 曲线显示对齐到 AFAS 平滑预览，但目标是实时曲线观感和 payload 控制，并未新增独立的实时 `As / Af / AF95` 数值合同。

#### Fix summary

待实现。

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_analysis_service.py backend/tests/integration/test_live_offline_run_service.py::test_streamed_live_offline_run_frame_events_emit_lightweight_smoothed_afas_preview backend/tests/integration/test_live_offline_run_service.py::test_streamed_live_offline_run_short_frame_events_defer_afas_preview -q
Result: PASS, 9 passed.

rg -n "AF95|af95|Af95|AF_95|normalized 95|95%|As / Af|Af-tan|lightweight|轻量|实时结果链" backend/src frontend/src backend/tests frontend/tests problem.md docs --glob '!frontend/dist/**' --glob '!frontend/node_modules/**'
Result: 未发现 AF95 或独立 Run realtime As/Af 轻量分析实现；仅发现 AFAS As/Af-tan 和 smoothed preview 相关记录。
```

#### Browser retest log

- Retest date:
- Browser:
- OS:
- Frontend URL:
- Backend URL:
- Dataset:
- Page:
- Steps:
- Expected:
- Actual:
- Result: PASS / FAIL
- Evidence:

#### Final status

OPEN


### P-0039 — Run 页实时 temperature-distance 曲线过小且缺少监护式状态分层

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/main.tsx`, `frontend/src/curves.ts`, `frontend/src/styles.css`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

Run 页实时 temperature-distance 曲线仍更像小型报告图，未充分承担实时监护 / 工业 trend chart 的核心信息角色。当前表现包括：

```text
1. 曲线视觉面积和层级不足。
2. 当前 distance / temperature / frame / sync / valid 状态不够集中。
3. raw / smoothed / 状态语义未形成 Run 专用分层。
4. TEMP_SYNC_STALE / TEMP_SYNC_MISSING / INVALID 的断线和状态 rug 语义缺少可测模型。
5. target temperature 缺少淡色 vertical band/marker。
```

#### Expected

```text
Run 页曲线作为右侧结果面板核心信息。
桌面端曲线高度 >= 360px。
图上方显示 compact value strip。
主曲线仅显示正式可进入 temperature-distance 曲线的数据。
raw/reference 点低透明显示。
latest point 显示更大圆点、vertical cursor 和可读标签。
STALE / MISSING / INVALID 不连成正式有效曲线，图底部使用状态 rug/timeline 标记。
target temperature 使用淡色 vertical band/marker。
支持 latest window / full run 切换，运行中默认 latest，停止后默认 full。
tick label >= 12px，axis label >= 13px。
```

#### Actual

修复前 Run 页复用通用 `CurveView` / `CurveGrid`，更偏小型报告图；Run 图未形成专用 value strip、断线模型、状态 rug、latest cursor 和 target band。

#### Fix summary

1. `frontend/src/curves.ts`
   - 新增 `buildRunTrendModel()` Run 专用曲线模型。
   - 输出 formal segments、reference points、status rugs、latest point、value strip、latest/full window。
   - `TEMP_SYNC_STALE`、`TEMP_SYNC_MISSING`、`INVALID*` 不进入 formal line；中间存在异常 rug 时 formal line 自动断开。
   - live smoothed preview 只有覆盖到最新 raw formal point 时才作为 Run 主线，否则回退为后端正式 raw temperature-distance，避免 latest cursor 滞后。
   - Run trend tick 根据数值范围保留小数，避免平坦曲线出现重复 tick label。

2. `frontend/src/main.tsx`
   - 新增 `RunTrendChart`、`RunValueStrip`、hover tooltip、latest cursor/label、target temperature band。
   - Run 页右侧结果面板改为 trend chart 优先，frame overlay 下移。
   - 运行中默认 `Latest window`，停止/已有结果默认 `Full run`。

3. `frontend/src/styles.css`
   - Run trend 桌面 SVG 高度 420px、最小高度 360px。
   - 主线 3.8px 高对比实线，raw/reference 点低透明灰色。
   - tick label 12px，axis label 13px，value strip 关键值 16px。
   - 状态 rug 使用线型 + marker 形状区分，不只依赖颜色。

#### Tests run

```bash
npm test
Result: PASS, 9 passed.

npm run build
Result: PASS, Vite production build completed.
```

新增/覆盖前端测试：

```text
run trend model breaks invalid and stale points out of the formal curve
run trend model defaults to a recent window while running
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Headless Google Chrome via DevTools Protocol
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps:
  1. Open G3 frontend in Chrome.
  2. Select `golden_a_20260522_dev_lab`.
  3. Run Live Offline from frame 1.
  4. Confirm Run trend appears at top of right result panel.
  5. Confirm running mode defaults to `Latest window`.
  6. Wait until at least 24 formal temp-distance points are present.
  7. Confirm compact value strip, latest cursor/label, reference points, chart height, tick/axis font sizes.
  8. Stop run and confirm default mode changes to `Full run`.
  9. Set target temperature to `1.30 °C` and confirm target band/marker appears.
- Expected: Run chart behaves as industrial realtime trend chart; invalid/stale/missing are not connected by model; desktop chart height >= 360px; target band visible when target falls in x-range.
- Actual:
  - Chart height: `420px`.
  - Running active mode: `Latest window`.
  - Stopped active mode: `Full run`.
  - Tick labels: `12px`.
  - Axis labels: `13px`.
  - Latest point label example: `frame 25 · 1.40°C · 988.0px`.
  - Target marker text: `Target 1.30°C`.
  - Formal line and reference points rendered; status rug behavior covered by unit test model.
- Result: PASS
- Evidence:
  - `output/playwright/p0039_run_trend_live_latest.png`
  - `output/playwright/p0039_run_trend_stopped_full.png`
  - `output/playwright/p0039_run_trend_target_band.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


### P-0040 — Analysis / Export 页 AFAS 曲线过小且 raw/smoothed/baseline/tangent/markers 视觉权重未分层

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/main.tsx`, `frontend/src/curves.ts`, `frontend/src/styles.css`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

Analysis / Export 页 AFAS temperature-distance 曲线仍更像小型报告图，不适合工程复核和报告前检查。当前表现包括：

```text
1. Analysis 曲线区域被 Export / 参数面板挤压，桌面端视觉面积不足。
2. raw points、smoothed curve、baseline、tangent、As/Af、max slope 的视觉权重接近。
3. baseline/tangent/marker 多条线和虚线争夺注意力。
4. 图内直接标注不足，工程复核人员需要依赖图例和颜色猜语义。
5. 缺少 Raw / Fit / Markers 图层开关和 brush zoom / reset zoom 复核交互。
```

#### Expected

```text
Analysis 图表区域成为页面主视觉，桌面端高度 480-560px。
结果指标放图上方横向 summary strip。
Raw points 使用低透明灰色小点。
Smoothed curve 为主曲线，深青/蓝绿色 3.5-4px 实线。
Low baseline / High baseline 仅作为辅助拟合线，只在拟合温度区间内显示，并明显弱于主曲线。
Tangent 为 AFAS 判定核心线，橙红/红色 2.5-3px 实线。
As / Af-tan 为 vertical reference rule + badge，badge 显示温度值。
Max slope 使用 diamond / outlined marker 并直接标注。
Outliers 使用小叉或 hollow marker。
支持 hover tooltip、Raw/Fit/Markers 图层开关、brush zoom 和 reset zoom。
tick label >= 12px，axis label >= 13px，marker label >= 12px。
前端只展示后端 AFAS 输出，不重新推导正式 AFAS。
```

#### Actual

修复前 Analysis 页复用通用 `CurveView` / `CurveGrid`，图高约 220px，raw/smoothed/baseline/tangent/markers 视觉层级不够清晰，参数面板和结果指标占用主图空间。

#### Fix summary

1. `frontend/src/curves.ts`
   - 新增 `buildAnalysisAfasModel()` 专用显示模型。
   - 从后端 `afas_preprocessing.raw`、`afas_preprocessing.smoothed`、`afas_preprocessing.outlier_repair.outlier_mask`、`afas_analysis.fit`、`afas_analysis.result` 读取展示数据。
   - 输出 raw points、outlier points、smoothed path、fit lines、As/Af/max slope markers、summary strip、ticks、x/y domain。
   - baseline line 按后端 `range_celsius` 和当前 zoom domain 裁剪；tangent 只做后端 slope/intercept 的显示映射。
   - Raw / Fit / Markers 图层开关只影响展示层，不改动后端结果。

2. `frontend/src/main.tsx`
   - 新增 `AnalysisAfasChart`、summary strip、图层 checkbox、hover tooltip、brush zoom、reset zoom。
   - Analysis 页面改为纵向工作台：Export / run 信息置顶，AFAS 主图占完整工作区宽度，参数面板移到图下方折叠区。
   - 修复快速 brush drag 时 React state 可能尚未重渲染的问题，使用 `useRef` 保存正在拖拽的 brush 状态。

3. `frontend/src/styles.css`
   - Analysis AFAS 图桌面高度 540px。
   - raw 点低透明灰色；smoothed 主线 3.8px；baseline 弱虚线 + 淡拟合区间；tangent 2.9px 橙红实线。
   - As/Af 使用 reference rule + badge；max slope 使用 diamond marker。
   - tick label 12px，axis label 13px，marker label 12px。
   - 移动端保留横向滚动最小图宽，避免字体被压缩。

#### Tests run

```bash
npm test -- --test-name-pattern "analysis AFAS model"
Result: PASS, 11 passed under filtered node:test run.

npm test
Result: PASS, 11 passed.

npm run build
Result: PASS, Vite production build completed.

VITE_G3_API_BASE=http://127.0.0.1:8020 npm run build
Result: PASS, Vite production build completed for preview check. Preview on 5181 was not used for final browser retest because backend CORS did not allow that port.
```

新增前端测试：

```text
analysis AFAS model separates review layers and keeps baselines clipped to fit ranges
analysis AFAS model honors layer toggles and zoom domain without recalculating data
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Headless Google Chrome via Playwright
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run / Analysis / Export
- Steps:
  1. Open G3 frontend in Chrome.
  2. Select `golden_a_20260522_dev_lab`.
  3. On Setup, set `Frame = 350` and `Target °C = 2.0`.
  4. Start Live Offline Run.
  5. Wait until run completes at `121 / 121` frames.
  6. Open Analysis / Export.
  7. Confirm AFAS summary strip, 540px chart, raw/smoothed/baseline/tangent/As/Af/max slope layers.
  8. Confirm Raw / Fit / Markers toggles hide their corresponding layers while smoothed curve remains.
  9. Brush-drag over chart; confirm zoom caption changes to `1.73-1.90 °C` and Reset zoom becomes enabled.
  10. Click Reset zoom; confirm caption returns to `Full analysis range`.
- Expected: Analysis AFAS chart is the main visual; layer weights match engineering review requirements; fonts meet minimum sizes; interactions work without frontend recalculating AFAS.
- Actual:
  - Run id: `run-golden_a_20260522_dev_lab-20260607T135603826107Z`
  - Formal temp-distance points: `121`
  - Raw points rendered: `121`
  - Fit lines rendered: `3`
  - Markers rendered: `3`
  - SVG chart box: `880px × 540px`
  - Tick label font: `12px`
  - Axis label font: `13px`
  - Marker label font: `12px`
  - Raw/Fit/Markers toggles all hid their corresponding layers; smoothed curve remained.
  - Brush zoom changed caption from `Full analysis range` to `1.73-1.90 °C`; reset restored full range.
- Result: PASS
- Evidence:
  - `output/playwright/p0040_analysis_afas_chart_full_verified.png`
  - `output/playwright/p0040_analysis_afas_layers_off.png`
  - `output/playwright/p0040_analysis_afas_brush_zoom.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0041 — G3 未复用 starter 的 MVS runtime bootstrap，真机连接后仍无法加载 SDK binding

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `backend/src/yyt1771_g3/camera/hik_mvs_source.py`, `configs/local/realcamera_temp.local.yaml`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

用户已连接真实 Hik 相机，并要求在 `realcamera-temp` 分支按 `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter` 的相机设置进行真机调试。G3 当前 local hardware profile 中 `sdk_python_paths` 和 `sdk_library_path` 为空；用默认 arm64 Python 直接导入 `MvCameraControl_class` 失败。

进一步按 starter 环境检查发现：

```text
MVS Python binding:
/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/_local/tmp_hik/MVS_inner_expand_current/Install.pkg/Payload/MVS_SDK/Samples/Python/MvImport/MvCameraControl_class.py

MVS patched dylib:
/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/_local/tmp_hik/patched_runtime_dlopen_20260525_1738/lib/libMvCameraControl.dylib

Dedicated x86 Python:
/Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3
```

但 G3 当前 `HikMvsCameraSource._load_sdk()` 只尝试普通 import，缺少 starter 中的 `HIK_MVS_LIBRARY_PATH` source override / sidecar bootstrap。直接在 x86 环境添加 `HIK_MVS_PYTHON_PATH` 后仍会因为官方 binding 硬编码 `/usr/local/lib/libMvCameraControl.dylib` 而失败。

#### Expected

```text
1. G3 使用和 starter 等价的 MVS Python binding 路径、patched dylib 路径和 sidecar runtime。
2. 无 SDK 时仍保持 lazy import / offline fallback。
3. 用 x86_64 MVS runtime 时能导入 SDK、枚举相机、preview 真实帧。
4. Real Camera Run 保存 raw frame、FrameRecord、DetectionResult 和温度同步字段。
```

#### Actual

```text
Default Python:
arm64 /Users/lulingfeng/miniforge3/bin/python3
MvCameraControl_class import: ModuleNotFoundError

x86 MVS Python:
x86_64 /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3
MvCameraControl_class import with HIK_MVS_PYTHON_PATH:
OSError: dlopen(/usr/local/lib/libMvCameraControl.dylib): no such file
```

#### Suspected cause

G3 没有 starter 的 `_import_hik_mvs_sdk_module_with_library_override()` 逻辑，无法把官方 binding 中的 `/usr/local/lib/libMvCameraControl.dylib` 替换为本地 patched runtime；同时真机调试必须用 x86_64 Python，因为本机 MVS dylib 是 x86_64。

#### Fix summary

2026-06-07:

```text
1. `backend/src/yyt1771_g3/camera/hik_mvs_source.py` 增加 starter 等价的 MVS SDK source override：
   - 从 hardware profile / env 读取 `sdk_python_paths` / `sdk_library_path`。
   - 找到官方 `MvCameraControl_class.py` 后，将硬编码 `/usr/local/lib/libMvCameraControl.dylib` 替换为 profile 中的 patched dylib。
   - 将 starter runtime sidecar dylib 通过 `/tmp/mvs` symlink staging 提供给 patched runtime。
2. 保持 lazy import：无 SDK、无相机、arm64 默认 Python 下 offline/playback/live offline 仍不受影响。
3. `configs/local/realcamera_temp.local.yaml` 写入本机已验证 starter MvImport 路径和 patched dylib 路径；源码中没有硬编码这些绝对路径。
4. 新增 regression，验证官方 binding 的 hardcoded dylib 会被 profile `sdk_library_path` 覆盖。
```

#### Tests run

```bash
Initial diagnostics:
PYTHONPATH=backend/src python3 -c "import MvCameraControl_class"
Result: FAIL, ModuleNotFoundError

HIK_MVS_PYTHON_PATH=<starter MvImport> HIK_MVS_LIBRARY_PATH=<starter patched dylib> /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -c "import MvCameraControl_class"
Result: FAIL, official binding still tried /usr/local/lib/libMvCameraControl.dylib

PYTHONPATH=backend/src python3 -m pytest backend/tests/unit/test_camera_lazy_import.py -q
Result: PASS, 5 passed

PYTHONPATH=backend/src python3 -m pytest backend/tests -q
Result: PASS, 78 passed

cd frontend && npm test
Result: PASS, 13 passed

cd frontend && npm run build
Result: PASS
```

#### API / hardware retest log

```text
Python: /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3
Architecture: x86_64
Backend URL: http://127.0.0.1:8032/

SDK load:
G3 loaded starter MvCameraControl_class.py with profile patched dylib override.
has MvCamera: True

MVS enum:
enum ret: 0
device count: 1
transport: 1

GET /api/camera/preview:
HTTP 200
camera_status: ok
shape: [1364, 2048]
dtype: uint8
model: MV-CA060-11GM
serial_number: 00J67378626
ip: 192.168.3.211
camera_resulting_fps: 10.0

POST /api/real-camera-runs:
HTTP 200
run_id: run-real_camera-20260607T143255949515Z
dataset_id: real_camera
frames saved: 160
detection statuses sampled: VALID
sync statuses sampled: TEMP_SYNC_MISSING
temperature_distance_points: 0
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Headless Google Chrome via Playwright
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8032/`
- Dataset: `real_camera`
- Page: Run
- Steps: Start backend with x86 MVS environment; open G3 frontend; click Run tab; click Real Camera `Preview`; click Real Camera `Run`; wait for run completion and inspect run trend, saved frame canvas and API responses.
- Expected: Preview/Run uses real Hik camera through starter-equivalent MVS runtime; run manifest contains camera metadata and raw frames; no SDK import error appears.
- Actual: Preview returned real Hik metadata (`MV-CA060-11GM`, `00J67378626`, `192.168.3.211`); Real Camera Run completed in browser with 160 saved frames and run id `run-real_camera-20260607T143255949515Z`; no `MvCameraControl_class` / dylib import error appeared.
- Result: PASS
- Evidence:
  - `output/playwright/p0042_realcamera_preview_browser_20260607.png`
  - `output/playwright/p0042_realcamera_run_browser_20260607.png`
  - `output/playwright/p0042_realcamera_browser_summary_20260607.json`
  - `output/hardware/real_camera_api_summary_20260607_after_p0042.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0042 — Real Camera Run 后帧画布仍显示当前离线 dataset frame，真实 run 底图来源不一致

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `frontend/src/main.tsx`, `frontend/src/api/client.ts`, `backend/src/yyt1771_g3/api/main.py`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

真实 Hik 相机已可通过 G3 API 进行 Preview / Run，但浏览器真实 run 复测发现：Run Trend 标题显示 `Real camera run · run-real_camera-...`，下方帧画布标题和图片仍来自当前离线 dataset，例如 `golden_a_20260522_dev_lab · live frame 160`。

这会造成 Real camera run 的 UI 显示结果与后端保存的真实 raw frame 不一致，违反 `Offline playback / Live offline run / Real camera run 结果不一致` 必须登记和修复的规则。

#### Expected

```text
Real Camera Run 完成后，帧画布应使用该 run manifest 中 frame_records 对应的真实 raw frame。
标题应标明 Real camera run 和 run_id，而不是当前离线 dataset id。
如果真实 run frame 不存在或无法读取，应明确显示 unavailable，不能退回离线 dataset frame 冒充真实 run。
```

#### Actual

```text
Browser Real Camera Run:
Run Trend: Real camera run · run-real_camera-20260607T141626763680Z
Frame canvas title: golden_a_20260522_dev_lab · live frame 160
Frame image URL: offline dataset frame URL
```

#### Suspected cause

`RunPage` 中 `latestFrameUrl` 在 `liveRun?.frameUrl` 不存在时，无论 run 来源如何都退回 `frameIndexImageUrl(dataset.id, latestDetection.frame_index)`；真实相机 run 没有前端可用的 run raw frame PNG endpoint，因此显示了当前离线 dataset frame。

#### Fix summary

2026-06-07:

```text
1. 新增 `GET /api/runs/{run_id}/frames/{frame_index}.png`：
   - 只通过 run manifest 的 `frame_records` 查找帧。
   - 只读取 run 目录下的相对 `frame_path`，防止任意路径读取。
   - 支持 `max_width` 缩放，返回 PNG。
2. 前端 API client 新增 `runFrameImageUrl()` / `buildRunFrameImageUrl()`。
3. Run 页在 `run_manifest.dataset_id === "real_camera"` 且非 live offline run 时：
   - 使用 `/api/runs/{run_id}/frames/{frame_index}.png` 作为底图。
   - 标题显示 `Real camera run · {run_id} · frame {frame_index}`。
   - `FrameCanvas.sourceShape` 使用真实 run `frame_records[].shape`。
4. 若 run frame PNG 不存在，浏览器会显示 frame unavailable，不会回退到当前离线 dataset frame。
```

#### Tests run

```bash
PYTHONPATH=backend/src python3 -m pytest backend/tests/integration/test_camera_api.py::test_real_camera_run_endpoint_passes_temperature_controller_and_profile -q
Initial result before endpoint: FAIL, `/api/runs/{run_id}/frames/1.png` returned 404
After fix: PASS, 1 passed

cd frontend && npm test -- --test-name-pattern "run frame image URL"
Initial result before helper: FAIL, `buildRunFrameImageUrl is not a function`
After fix: PASS, 13 passed under filtered run

PYTHONPATH=backend/src python3 -m pytest backend/tests -q
Result: PASS, 78 passed

cd frontend && npm test
Result: PASS, 13 passed

cd frontend && npm run build
Result: PASS
```

#### API retest log

```text
Backend URL: http://127.0.0.1:8032/
POST /api/real-camera-runs:
HTTP 200
run_id: run-real_camera-20260607T142912384336Z
dataset_id: real_camera
frames: 3

GET /api/runs/run-real_camera-20260607T142912384336Z/frames/1.png?max_width=720:
HTTP 200
content-type: image/png
bytes: 59313
Evidence:
output/hardware/real_camera_run_frame_api_20260607_after_p0042.png
output/hardware/real_camera_api_summary_20260607_after_p0042.json
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Headless Google Chrome via Playwright
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8032/`
- Dataset: `real_camera`
- Page: Run
- Steps:
  1. Open frontend and select Run tab.
  2. Click `Read temp` and confirm LU92XX remains unavailable while serial is missing.
  3. Click Real Camera `Preview`.
  4. Click Real Camera `Run`.
  5. Wait for `run-real_camera-20260607T143255949515Z` to complete.
  6. Assert final frame canvas image URL contains `/api/runs/run-real_camera-20260607T143255949515Z/frames/160.png`.
  7. Assert body contains `Real camera run · run-real_camera-20260607T143255949515Z · frame 160`.
  8. Assert body no longer contains `golden_a_20260522_dev_lab · live frame`.
- Expected: Real camera run canvas uses saved run raw frame and real run title; no offline dataset fallback.
- Actual:
  - Run id: `run-real_camera-20260607T143255949515Z`
  - Frame count: `160`
  - Frame canvas image URL: `http://127.0.0.1:8032/api/runs/run-real_camera-20260607T143255949515Z/frames/160.png?max_width=1024`
  - Frame image natural size: `1024 x 682`
  - `hasRealRunFrameTitle`: true
  - `hasOfflineGoldenLiveFrameTitle`: false
  - run frame PNG response: HTTP 200, `image/png`
- Result: PASS
- Evidence:
  - `output/playwright/p0042_realcamera_run_initial_20260607.png`
  - `output/playwright/p0042_realcamera_preview_browser_20260607.png`
  - `output/playwright/p0042_realcamera_run_browser_20260607.png`
  - `output/playwright/p0042_realcamera_browser_summary_20260607.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0043 — Run/Analysis 曲线需要共享 variant 化底层 CurveView 并保持工业曲线层级

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/curves.ts`, `frontend/src/main.tsx`, `frontend/tests/curveSpecs.test.mjs`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

Run 页和 Analysis / Export 页的 G3 曲线已经分别完成工业监护式和工程复核式 redesign，但底层 SVG 坐标框、grid、axis、tick、axis label 仍在 `RunTrendChart` 和 `AnalysisAfasChart` 中各自手写一份。用户明确要求可以共享底层 `CurveView`，但必须支持不同 variant：

```text
run_monitor
analysis_review
```

如果继续保留两份坐标框绘制逻辑，后续字号、tick、坐标轴间距和浅色工业风格容易发生漂移，也更容易破坏 tick label >= 12px / axis label >= 13px 的硬性要求。

#### Expected

```text
1. Run 和 Analysis 使用共享底层曲线 frame/grid/axis/tick/axis label view。
2. 共享 view 支持 run_monitor 和 analysis_review 两种 variant。
3. Run / Analysis 各自的数据层、hover、brush、status rug、markers 和 layer toggles 保持独立。
4. 前端只展示后端输出，不计算正式 A/B、distance、temperature sync 或 AFAS。
5. stale/missing/invalid 仍不得被连成正式有效曲线。
6. 字号、线宽、marker、直接标签和浅色工业软件风格保持 P-0039 / P-0040 的浏览器验收效果。
```

#### Actual

修复前 `RunTrendChart` 与 `AnalysisAfasChart` 各自渲染 SVG frame、grid line、axis、tick 和 axis label。视觉效果可用，但底层 curve view 未按 variant 收敛。

#### Fix summary

1. `frontend/src/curves.ts`
   - 新增 `IndustrialCurveViewVariant = "run_monitor" | "analysis_review"`。
   - 新增 `buildIndustrialCurveFrameModel()`，集中返回 variant 对应的 frame/grid/axis/tick/label class mapping、axis layout 和最小文字指标。
   - 该模型只处理显示框架，不读取或推导任何后端正式测量 / AFAS 结果。

2. `frontend/src/main.tsx`
   - 新增共享 `IndustrialCurveView` React 组件。
   - `RunTrendChart` 改为 `variant="run_monitor"`，保留 value strip、正式曲线断线、reference points、target band、status rug、latest cursor 和 tooltip。
   - `AnalysisAfasChart` 改为 `variant="analysis_review"`，fit bands 作为 underlay，raw/outlier/smoothed/baseline/tangent/As/Af/max slope、layer toggle、brush zoom、reset zoom 和 tooltip 保持原逻辑。

3. `frontend/tests/curveSpecs.test.mjs`
   - 增加共享 frame model 测试，覆盖 `run_monitor` / `analysis_review` variant、class mapping 和 tick/axis 最小字号约束。

#### Tests run

```bash
npm test -- --runInBand
Result: PASS, 12 tests passed.

npm run build
Result: PASS, TypeScript + Vite production build completed.

git diff --check
Result: PASS, no whitespace errors.
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Headless Google Chrome via Playwright
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run / Analysis / Export
- Steps:
  1. Open G3 frontend in Chrome.
  2. Select `golden_a_20260522_dev_lab`.
  3. On Setup, set `Target °C = 2.00`.
  4. Open Run and start Live Offline Run.
  5. During run, verify Run monitor chart renders value strip, 420px chart SVG, thick formal temperature-distance line, latest cursor/tooltip and current point label.
  6. Wait until run returns to idle; open Analysis / Export.
  7. Verify Analysis summary strip, 540px AFAS review chart, raw points, smoothed curve, baseline fit bands/labels, tangent, As/Af-tan badges and Max slope marker.
  8. Toggle `Fit` layer off; confirm smoothed/raw/markers remain while fit layers hide.
  9. Brush-drag the AFAS chart; confirm zoom range caption changes and Reset zoom becomes enabled.
- Expected: Run and Analysis charts retain P-0039/P-0040 visual hierarchy while sharing the variant-based SVG frame; no backend result is recalculated by the frontend.
- Actual:
  - Run id: `run-golden_a_20260522_dev_lab-20260607T141426899025Z`.
  - Run chart observed while running at frame `122`; value strip showed `Current distance = 987.0 px`, `Current temperature = 1.20 °C`, `Sync status = INTERPOLATED`, `Valid / Invalid = VALID`, `Temp-distance points = 121`.
  - Run completed and returned to idle at live frame `470`; Analysis showed `Formal temp-distance points = 469` and `AFAS status = ok`.
  - Analysis summary showed `As = 1.34 °C`, `Af-tan = 1.48 °C`, `Max slope = 1.37 °C`, `Raw points = 469`, `Smoothed points = 29`, `Outliers = 0`.
  - Analysis chart rendered direct labels for `Low baseline`, `High baseline`, `Tangent`, `Smoothed curve`, `As 1.34°C`, `Af-tan 1.48°C`, and `Max slope`.
  - Fit toggle hid fit layers; brush zoom changed caption to `1.38-1.77 °C` and enabled Reset zoom.
- Result: PASS
- Evidence:
  - `output/playwright/p0043_run_monitor_shared_curve.png`
  - `output/playwright/p0043_analysis_review_shared_curve.png`
  - `output/playwright/p0043_analysis_review_zoom_toggle.png`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0044 — Run/Analysis 曲线不应把重复温度 raw frame 点按帧顺序连成正式折线

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/curves.ts`, `frontend/src/main.tsx`, `frontend/tests/curveSpecs.test.mjs`
- Found date: 2026-06-07
- Last update: 2026-06-07
- Owner/tool: Codex

#### Problem

用户指出 Run 页 Latest window 截图中的 temperature-distance 曲线不符合物理相变曲线形状，更像是把同一温度下多个 raw frame 点按帧顺序连成折线。由于温度同步值可能重复、插值、轻微回退，同一温度 bin 下会有多个帧和多个 distance_px。若直接连 raw frame points，会产生竖线、三角形、折返线，误导操作员认为样品物理变化异常。

#### Expected

```text
1. Raw frame temperature-distance points 只作为低权重 scatter/reference points。
2. Run 页正式线优先展示后端已有 `afas_preprocessing.smoothed`。
3. 若无 smoothed 但有 `afas_preprocessing.grouped`，展示后端 grouped/binned curve。
4. 若后端预处理曲线尚未输出，则只显示 raw scatter 和 latest cursor，不把 raw 点连成 formal line。
5. Analysis 页同样不得把 raw fallback 画成 smoothed line；smoothed line 只能来自后端 smoothed/grouped 预处理层。
6. 前端不得重新计算正式 A/B、distance、temperature sync、temperature bin、median/mean 或 AFAS，只展示后端结果。
```

#### Actual

修复前 `buildRunTrendModel()` 只有在 smoothed preview 被判断为覆盖最新 raw frame 时才使用 smoothed，否则退回 `analysis.temperature_distance` 并把 raw points 连成 `formalSegments`。由于后端 smoothed preview 不携带逐帧 frame_index，前端会误判 smoothed “不新鲜”，从而在 Run latest window 中连接 raw frame points。`buildAnalysisAfasModel()` 在缺少 smoothed 时也会把 raw `temperature_distance` fallback 成 `smoothedPath`。

#### Fix summary

1. `frontend/src/curves.ts`
   - 新增 `readPreprocessedTemperatureDistance()`，只读取后端 `afas_preprocessing.smoothed` 或 `grouped`。
   - Run line source 改为优先 backend smoothed，其次 backend grouped；无后端预处理曲线时不生成 formal line。
   - Run raw `temperature_distance` 固定作为 `referencePoints` scatter 和 latest cursor 来源。
   - Run latest window 以 raw reference window 为准，backend smoothed/grouped line 仅按该窗口温度范围裁剪显示。
   - `latestPoint` 改为最新 raw reference point，避免把 smoothed curve point 伪装成 frame point。
   - Analysis smoothed path 不再 fallback raw points；缺少后端 smoothed/grouped 时只显示 raw scatter。

2. `frontend/src/main.tsx`
   - Run inline label 改为 `backend smoothed curve` / `backend binned curve`。
   - Run tooltip 对无 frame_index 的 curve point 显示 `None`；latest cursor 仍显示 raw frame index。

3. `frontend/tests/curveSpecs.test.mjs`
   - 新增 regression：重复温度 raw frame points 只作为 scatter，backend smoothed points 按温度升序连线，latest cursor 来自 raw frame。
   - 更新旧断言：无后端预处理曲线时 latest window 只保留 raw scatter，不生成 raw formalSegments。

#### Tests run

```bash
npm test -- --runInBand
Result: PASS, 14 tests passed.

npm run build
Result: PASS, TypeScript + Vite production build completed.
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Headless Google Chrome via Playwright
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run / Analysis / Export
- Steps:
  1. Open G3 frontend and select `golden_a_20260522_dev_lab`.
  2. On Setup, set `Target °C = 1.60` with keyboard input and confirm Run page shows `Target = 1.60 °C`.
  3. Start Live Offline Run and observe Run trend during live updates.
  4. Confirm Run chart labels line source as `Backend smoothed temperature-distance`.
  5. Inspect Run SVG DOM layers: raw/reference frame points render as `circle.runTrendReferencePoint`; formal line renders as `polyline.runTrendFormalLine` with monotonic x positions from backend smoothed points.
  6. Wait until the run naturally stops at the target temperature.
  7. Open Analysis / Export and inspect AFAS chart layer counts and direct labels.
- Expected: Run and Analysis never connect raw frame temperature-distance points as the formal curve; raw frame points remain scatter; smoothed line is sourced only from backend `afas_preprocessing.smoothed`/`grouped`; latest cursor still points to the latest raw frame.
- Actual:
  - Run completed as `run-golden_a_20260522_dev_lab-20260607T153030317864Z`.
  - Run completed at frame `317`, temperature `1.60 °C`, with `316` formal temp-distance raw points.
  - Run chart displayed `Backend smoothed temperature-distance`; value strip showed latest raw frame cursor `frame 317 · 1.60°C · 985.0px`.
  - Run SVG layer inspection recorded `80` `circle.runTrendReferencePoint` elements for the live latest window and one `polyline.runTrendFormalLine`; the formal polyline used backend smoothed points with increasing x coordinates, not raw frame order.
  - Analysis / Export showed `Raw points = 316`, `Smoothed points = 17`, `Outliers = 0`.
  - Analysis SVG layer inspection recorded `circle.analysisAfasRawPoint: 316` and one `polyline.analysisAfasSmoothedLine`, plus fit bands/fit lines/tangent/As/Af/Max slope marker layers.
  - Analysis chart directly labeled `Low baseline`, `High baseline`, `Tangent`, `Smoothed curve`, `As`, `Af-tan`, and `Max slope`.
- Result: PASS
- Evidence:
  - `output/playwright/p0044_run_raw_scatter_backend_smoothed.png`
  - `output/playwright/p0044_run_completed_backend_smoothed_full.png`
  - `output/playwright/p0044_run_svg_layers.json`
  - `output/playwright/p0044_run_svg_line_layers.json`
  - `output/playwright/p0044_analysis_smoothed_no_raw_fallback.png`
  - `output/playwright/p0044_analysis_smoothed_no_raw_fallback_fullpage.png`
  - `output/playwright/p0044_analysis_svg_layers.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0045 — Setup 页面需要统一 Source 入口并自动显示真实相机 preview

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `frontend/src/main.tsx`, `frontend/src/setupSources.ts`, `frontend/src/api/client.ts`, `backend/src/yyt1771_g3/api/main.py`, `backend/src/yyt1771_g3/services/probe_service.py`, `backend/src/yyt1771_g3/core/models.py`, `backend/src/yyt1771_g3/core/enums.py`
- Found date: 2026-06-07
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

Setup 页面此前以离线 dataset 为唯一画布来源；真实相机 preview 只在 Run 页由用户手动点击 Preview 触发。这样真实相机不像离线素材一样作为 Setup source 参与 ROI 选框和调参，用户必须先跳到 Run 页才能看到真机当前帧。

#### Expected

```text
1. Setup 页面有 Source 选择：Offline dataset / Real camera。
2. 选择 Real camera，或当前 source 已是 Real camera 且进入 Setup 页面时，自动启动真实相机 preview。
3. Setup 页面直接显示真实相机当前帧，preview 仅用于选框和调参，不作为正式 run 数据。
4. Setup 页面显示 camera_status、model、serial_number、ip、pixel_format、frame shape、timestamp 和 preview refresh status。
5. 真实相机不可用时显示结构化错误，Offline dataset 流程不受影响。
6. Hik MVS SDK 继续 lazy import，不得影响普通 offline playback / live offline run。
7. 不在源码中硬编码本机 MVS 绝对路径；继续通过 `configs/local/realcamera_temp.local.yaml` 或 env/profile 读取。
8. Real camera Setup 支持 Live / Freeze / Resume Live / Refresh frame：
   - Live 以低频 UI preview 持续刷新当前帧、timestamp 和 metadata。
   - Freeze 固定当前显示帧，ROI 编辑继续叠加在冻结帧上。
   - Resume Live 后 ROI 保持 source pixel 坐标；若 frame shape 变化，必须提示 ROI 重新确认。
   - Frozen 状态下仍可 Capture new setup frame，且不清空已有 ROI，除非 shape 不兼容并提示确认。
9. Real camera Setup 使用与 Offline dataset 完全相同的 ROI 编辑器：
   - 支持新建/重置、移动、缩放、旋转 ROI。
   - 显示 ROI center / width / height / angle。
   - ROI 始终保存为 measurement/source pixel 坐标，浏览器窗口、CSS 和 canvas/image 尺寸不得影响正式 ROI。
   - Live 模式 ROI 编辑完成后刷新最新 setup frame 并叠加同一 ROI；Freeze 模式只更新冻结帧 overlay。
   - 保存/正式 run 的 measurement_definition 必须包含 `source = real_camera`、`measurement_coordinates = source_pixel`、当前 ROI、object_class、detector、width_mode 和 detector_config。
   - 前端只保存和显示 ROI，不计算正式 A/B 或 distance。
10. Real camera Setup 参数变化后的 frame refresh 规则：
   - ROI 数值、object_class、detector、width_mode 和影响 detector preview 的 detector_config 调整完成后，Live 模式 debounce 刷新最新 frame。
   - Freeze 模式不自动换掉冻结帧，只在冻结帧上更新 ROI / 参数 overlay，并提示用户用 Capture new setup frame 或 Resume live 查看最新画面。
   - target_temperature_celsius、temperature_power_percent、温控动作和 AFAS 后处理参数不得触发真实相机 frame refresh。
11. Real camera Setup 可选 Probe current frame：
   - Live 模式先抓取一张最新 setup frame 再 probe。
   - Freeze 模式使用冻结帧或最近一次 setup frame，不自动换成新相机帧。
   - Probe 请求必须发送当前 `measurement_definition` 到 backend。
   - Backend 返回 `DetectionResult` 后，Setup 显示 ROI、A/B overlay、distance_px、detection_status、rejected_reason 和 debug_artifacts。
   - Probe 结果仅用于 Setup 调试，不写入正式 run manifest；INVALID 必须如实显示，不得伪造正常 A/B。
12. Run 页面只负责正式测试：
   - 显示 Setup 保存的 source、ROI、object_class、detector、width_mode、max_frames_per_run、target_fps、target_temperature_celsius 和 temperature_power_percent。
   - Offline dataset source 保持现有 live offline run 流程。
   - Real camera source 点击 Run 时调用 `/api/real-camera-runs`，请求体中的 `measurement_definition` 必须完整来自 Setup 保存的定义。
   - Real camera run 结果画布必须显示 `/api/runs/{run_id}/frames/{frame_index}.png`，标题为 `Real camera run · {run_id} · frame {frame_index}`。
   - Run 页面不得承担 ROI 编辑职责；如需修改 ROI，必须回到 Setup。
13. Setup 页面 Temperature Control 区域包含 Read temp、Ports、target_temperature_celsius、temperature_power_percent、source/status、当前温度值和 unavailable/error 状态；温控参数变化、Read temp、Ports 均不得触发真实相机 frame refresh。
```

#### Actual

修复前 Setup 没有 Source 入口，也不会自动触发真实相机 preview。真机 preview 状态分散在 Run 页，错误只会进入全局字符串错误提示。

#### Fix summary

1. `backend/src/yyt1771_g3/api/main.py`
   - `/api/camera/preview` 响应增加顶层 `model`、`serial_number`、`ip`、`pixel_format` 字段，仍从 lazy `HikMvsCameraSource` 返回的 `camera_meta` 派生。
   - `/api/camera/preview` 响应增加 `image_data_url`，Setup 能显示与 metadata 同一次抓取对应的 frame，避免 metadata 与画面来自两次相机读取。
   - 新增 `/api/camera/setup-probe`：当请求不带 `frame_png_data_url` 时抓取最新真实相机 frame 并 probe；当请求带 `frame_png_data_url` 时直接使用该 setup frame probe，不打开相机。
   - `/api/camera/setup-probe` 返回 `DetectionResult`、ROI/A/B overlay payload、camera metadata 和同一帧 `image_data_url`，不写 run manifest。
   - 未改变 SDK 加载路径；仍通过 hardware config / env profile 读取，不硬编码本机 MVS 路径。

2. `backend/src/yyt1771_g3/services/probe_service.py`
   - 新增 `probe_setup_frame()`，复用正式 backend detector 对给定 frame array + measurement_definition 执行 Setup probe。
   - Probe 结果保持 `DetectionResult` 的 VALID/INVALID 契约：INVALID 不携带正式 A/B 和 distance。

3. `frontend/src/api/client.ts`
   - `CameraPreviewResponse` 补齐 Setup 需要显示的相机 metadata 字段。
   - `CameraPreviewResponse` 增加可选 `image_data_url`。
   - 新增 `probeRealCameraSetupFrame()`，向 `/api/camera/setup-probe` 发送 `measurement_definition`，Freeze 时额外发送当前 setup frame 的 PNG data URL、timestamp 和 camera_meta。
   - 新增 `ApiError` / `ApiErrorDetail`，保留 FastAPI 结构化 `detail`，便于 Setup 显示 `camera_status`、`message` 和 `details`。
   - `MeasurementDefinition` 增加 `source: offline_dataset | real_camera`，使 Setup 保存的数据源进入正式 run 请求体。

4. `frontend/src/setupSources.ts`
   - 新增 `SETUP_SOURCE_OPTIONS`：`Offline dataset` / `Real camera`。
   - 新增 real-camera preview measurement helper：首次切到真机时按 preview frame shape 初始化 ROI；后续刷新不重置用户已调好的真机 ROI。
   - 新增 `createDefaultRoiForShape()`，离线素材和真实相机的 New / reset ROI 使用同一套 source-shape 规则。
   - 新增 preview refresh status label。
   - 新增 Real camera Setup preview 状态机：`live` / `frozen`、低频轮询判定、冻结 timestamp、shape 变化检测和 ROI 重新确认状态。
   - 新增 `shouldRefreshRealCameraFrameAfterRoiCommit()`，只在 Setup + Real camera + Live 模式的 ROI commit 后触发 frame refresh。
   - 新增 preview-affecting change 分类：ROI / object_class / detector / width_mode / detector preview config 会在 Live 模式刷新；温控和 AFAS 后处理参数不会刷新。
   - 新增 Frozen frame 提示文案 helper。
   - Real camera preview measurement refresh 保留已有 `width_mode`，避免参数刷新时静默覆盖用户选择。
   - 新增 `buildRunSetupSummary()`，Run 页面 summary 直接由 Setup 保存的 `measurement_definition` 派生，不在 Run 页面重建 ROI 或默认参数。
   - 新增 `runResultMatchesSetupSource()`，避免 source 切换后显示不匹配的旧 run 结果。

5. `frontend/src/main.tsx`
   - Setup 页面新增 Source segmented control。
   - 当 source 为 `real_camera` 且进入 Setup 且 preview mode 为 Live 时，以 1 fps UI preview 频率自动调用 `previewRealCamera()`。
   - Real camera Setup 显示 preview 状态、metadata、frame shape、timestamp、refresh status 和结构化错误；可手动 Refresh preview。
   - Real camera preview 只作为 Setup 选框/调参画布，不显示 probe A/B overlay，也不创建正式 run 数据。
   - Real camera Setup 新增 Live / Freeze 控制：Freeze 固定当前画面并停止自动刷新，Resume live 恢复低频刷新，Capture new setup frame 在 Frozen 状态也可抓取最新帧并保持 ROI。
   - 如果 Live/Refresh 后 frame shape 与上一帧不同，Setup 显示 ROI 需确认的结构化提示，用户确认前不静默视为安全 ROI。
   - 点击左侧 offline dataset 会切回 `offline_dataset` source，离线 Setup / Probe 流程保持原路径。
   - Offline dataset 和 Real camera 共用同一个 `FrameCanvas` ROI 编辑器；真实相机 preview 图像上可移动、缩放、旋转 ROI。
   - `FrameCanvas` 增加 ROI commit 回调：拖拽中只更新 overlay/ROI 数值，pointer up 后才在 Real camera Live 模式触发最新 frame refresh；Freeze 模式不自动刷新。
   - Measurement ROI 面板新增 `New / reset ROI`，按当前 source frame shape 生成 source-pixel ROI，并继续显示 center / width / height / angle。
   - Real camera measurement 更新时同步内部 measurement ref，避免 Live 模式 ROI commit 后刷新 frame 时发送旧 ROI。
   - 新增 Detector Setup 面板：object_class、detector、width_mode、min_component_area_px、envelope_window_px、envelope_step_px、mask_open_kernel_px、mask_close_kernel_px、mask_dilate_kernel_px。
   - ROI 数值框和 Detector Setup 数值框用 blur / Enter 作为调整完成时机；连续 detector_config 输入通过 500 ms debounce 合并，避免频繁打开相机。
   - Freeze 时清理 pending debounce，并忽略 Freeze 后才返回的旧 Live preview 响应，防止冻结帧被晚到的自动刷新替换。
   - Temperature Control 面板继续只更新温控字段，不触发真实相机 preview refresh。
   - Real camera Setup 状态面板新增 `Probe current frame`。
   - Live Probe 调用 `/api/camera/setup-probe` 让 backend 抓取最新 frame 并返回同一 frame 的 DetectionResult / image_data_url。
   - Freeze Probe 将当前 setup frame 的 PNG data URL 随 `measurement_definition` 发给 backend，避免在冻结状态下偷偷换成新相机帧。
   - Real camera Setup 显示 Probe Result：frame timestamp、detection_status、distance_px、rejected_reason 和 debug_artifacts 数量；展开 diagnostics 可查看完整 response，包括 ROI、DetectionResult 和 debug_artifacts。
   - Real camera FrameCanvas 复用离线素材同一个 ROI/A/B/debug overlay；只显示当前 source 匹配的 probe 结果，preview 自动刷新会清除旧 probe，避免 stale A/B overlay 贴到新 frame。
   - Run 页面 mode 改为由 Setup source 派生：`offline_dataset` 显示 Live Offline Run 并执行 live offline run，`real_camera` 显示 Real Camera Run 并执行正式 real camera run。
   - Run 页面移除旧的手动 Real Camera Preview 面板和 preview frame；Run 只消费 Setup 保存的 measurement definition。
   - Run 页面新增 Setup Summary，显示 Source、ROI center / width / height / angle、object_class、detector、width_mode、max_frames_per_run、target_fps、target_temperature_celsius、temperature_power_percent。
   - 切换 Setup source 时清理旧 probe / runResult / liveRun，防止 Offline dataset frame 或旧 real-camera run 结果残留在当前 source 下。
   - Real camera run 完成后，右侧只读 `FrameCanvas` 使用 `runFrameImageUrl(run_id, frame_index)` 指向 `/api/runs/{run_id}/frames/{frame_index}.png`，标题显示 `Real camera run · {run_id} · frame {frame_index}`，overlay / A/B / distance / temperature / sync status 均来自 backend run result。
   - Setup Temperature Control 新增 Read temp / Ports 操作、温控 source/status/current/error 显示和结构化 unavailable 展开区；target/power 仍写入 Setup `measurement_definition.detector_config`。
   - Run 页面移除温控 Read temp / Ports 面板，Run 只消费 Setup summary 和 backend run result。

6. `backend/src/yyt1771_g3/core/enums.py`, `backend/src/yyt1771_g3/core/models.py`
   - 新增 `MeasurementSource` 枚举。
   - `MeasurementDefinition` 增加 `source` 字段，默认 `offline_dataset`，兼容旧离线请求；real camera run 可显式保存并回传 `source = real_camera`。

#### Tests run

```bash
PYTHONPATH=backend/src pytest backend/tests/integration/test_camera_api.py::test_camera_preview_endpoint_returns_setup_metadata
Result: PASS

npm test -- tests/setupSources.test.mjs
Result: PASS, 23 tests passed.

npm test -- tests/setupSources.test.mjs tests/roiCoordinates.test.mjs
Result: PASS, 24 tests passed.

npm test -- tests/apiClientUrls.test.mjs
Result: PASS, 24 tests passed.

npm test -- tests/apiClientUrls.test.mjs tests/setupSources.test.mjs tests/roiCoordinates.test.mjs
Result: PASS, 24 tests passed.

npm run build
Result: PASS

PYTHONPATH=backend/src pytest backend/tests/integration/test_camera_api.py::test_real_camera_run_endpoint_passes_temperature_controller_and_profile
Result: PASS

PYTHONPATH=backend/src pytest backend/tests/integration/test_camera_api.py backend/tests/unit/test_camera_lazy_import.py
Result: PASS, 12 tests passed.

PYTHONPATH=backend/src pytest backend/tests/integration/test_probe_api.py
Result: PASS, 3 tests passed.

PYTHONPATH=backend/src pytest backend/tests/integration/test_probe_api.py backend/tests/integration/test_camera_api.py backend/tests/unit/test_camera_lazy_import.py
Result: PASS, 15 tests passed.

git diff --check
Result: PASS

npm test -- tests/setupSources.test.mjs
Result: PASS, 26 tests passed.

npm test -- tests/apiClientUrls.test.mjs tests/setupSources.test.mjs tests/roiCoordinates.test.mjs
Result: PASS, 27 tests passed.

PYTHONPATH=backend/src pytest backend/tests/integration/test_camera_api.py backend/tests/unit/test_camera_lazy_import.py
Result: PASS, 12 tests passed.

npm run build
Result: PASS

git diff --check
Result: PASS

rg -n "/Users/lulingfeng|MVS_inner_expand|patched_runtime_dlopen|MvImport" backend/src frontend/src backend/tests frontend/tests
Result: PASS, only `backend/tests/unit/test_camera_lazy_import.py` references temporary test `MvImport`.

npm test -- tests/setupSources.test.mjs
Result: PASS, 28 tests passed.

PYTHONPATH=backend/src pytest backend/tests/integration/test_real_camera_run_service.py::test_real_camera_run_best_effort_temperature_startup_attempts_all_controls
Result: PASS

PYTHONPATH=backend/src pytest backend/tests/integration/test_real_camera_run_service.py backend/tests/integration/test_camera_api.py backend/tests/unit/test_analysis_service.py
Result: PASS, 18 tests passed.

npm run build
Result: PASS
```

#### Browser retest log

- Retest date: 2026-06-07
- Browser: Playwright CLI Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/` for browser flow and latest direct `/api/camera/preview` check; earlier new-code preview check also ran against `http://127.0.0.1:8034/api/camera/preview`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps:
  1. Open Setup page.
  2. Confirm Source control shows `Offline dataset` and `Real camera`.
  3. Confirm default Offline dataset source lists `golden_a_20260522_dev_lab`, displays frame 1, and keeps Frame / Probe controls.
  4. Click `Real camera`.
  5. Confirm browser automatically issues `/api/camera/preview`.
  6. Confirm Setup shows `camera_status`, `model`, `serial_number`, `ip`, `pixel_format`, frame shape, timestamp, and preview refresh status.
  7. Because current SDK/runtime is unavailable, confirm structured error panel appears and the preview placeholder shows the error without breaking the page.
  8. Click `Offline dataset` and confirm offline frame 1, Frame / Probe controls, dataset status, and ROI controls return.
  9. Select `Real camera`, then open Run.
  10. Confirm Run shows `Real Camera Run`, `Setup source = Real camera`, `Source ID = real_camera`, `Start frame = Live`, and `Start real camera run`.
  11. Confirm Run has no manual Preview button and no preview frame figure; Setup-only preview state is not shown in Run.
  12. Open Setup again while source is still Real camera and confirm Setup auto-refreshes `/api/camera/preview` and shows the structured unavailable preview state.
  13. Switch back to `Offline dataset`, open Run, and confirm Run shows `Live Offline Run`, `Setup source = Offline dataset`, `Source ID = golden_a_20260522_dev_lab`, and `Start full offline run`.
- Expected: Real camera source auto-starts preview; unavailable camera shows structured error; offline dataset flow remains usable.
- Actual:
  - `/api/camera/preview` was called automatically after selecting `Real camera`.
  - Current browser backend returned `503` with `camera_status = unavailable` and message `Hik MVS SDK is not available; offline playback and live offline run remain available`.
  - Setup displayed `camera_status = unavailable`, metadata fields, `Preview refresh = Camera unavailable`, structured JSON error, and preview placeholder.
  - Run displayed formal `Real Camera Run` derived from Setup source, with `Start real camera run`; page text/button inspection found no Preview action and no preview frame figure.
  - Returning from Real Camera Run to Setup kept Real camera source and auto-called preview again.
  - Switching back to `Offline dataset` restored `golden_a_20260522_dev_lab` frame 1 and offline Frame / Probe controls.
  - Offline Run displayed formal `Live Offline Run`, `Source ID = golden_a_20260522_dev_lab`, and `Start full offline run`.
  - Direct `/api/camera/preview` check on port `8020` returned the same structured `503`; earlier port `8034` check also returned `503`. The current SDK/runtime is unavailable in this environment, so true hardware-frame display could not be verified here.
- Result: PARTIAL PASS
- Evidence:
  - `output/playwright/p0045_setup_real_camera_source_unavailable.png`
  - `output/playwright/p0045_setup_offline_source_after_realcamera.png`
  - `output/playwright/p0045_run_real_camera_source_no_preview_button.png`
  - `output/playwright/p0045_run_offline_source_formal_run.png`

#### Browser retest log — Live / Freeze setup preview controls

- Retest date: 2026-06-07
- Browser: Playwright CLI Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup
- Steps:
  1. Reload Setup and confirm Offline dataset still shows `golden_a_20260522_dev_lab` frame 1.
  2. Click `Real camera`.
  3. Confirm Live mode is selected, `Live refresh = 1 fps UI preview`, and `/api/camera/preview` is called.
  4. With current hardware/SDK unavailable, confirm structured error is shown and Freeze is disabled because no current frame exists.
  5. Confirm unavailable status stops automatic 1 fps retry spam; browser console showed one 503 for the real backend preview request after the fresh reload/click.
  6. Install a Playwright route that returns mocked `/api/camera/preview` JSON frames and mocked preview image content, then click `Refresh frame`.
  7. Confirm metadata/timestamp/frame shape update in Setup and ROI overlay remains on the current frame.
  8. Click `Freeze` and confirm `Preview mode = Frozen frame`, `Frozen timestamp` equals the displayed frame timestamp, and `Live refresh = Paused`.
  9. While frozen, click `Capture new setup frame` and confirm timestamp updates, mode remains Frozen, and existing ROI values are not cleared.
  10. Click `Resume live` and confirm mode returns to Live, Frozen timestamp clears, and ROI remains.
  11. In the mocked flow, return a changed frame shape and confirm Setup shows `Frame shape changed ... confirm ROI before formal run`; click `Confirm ROI` and confirm the warning clears.
- Expected: Real camera Setup supports low-rate Live preview, Freeze, Resume live, frozen Refresh/Capture, metadata/timestamp display, and ROI shape-change confirmation without turning preview into a formal run.
- Actual:
  - Real backend no-hardware path displayed Live controls, structured unavailable error, disabled Freeze, enabled Refresh frame, and did not affect offline dataset flow.
  - Browser-mocked frame flow displayed `camera_status = ok`, model/serial/ip/pixel_format, frame shape, timestamp, Live/Frozen state, frozen timestamp, paused live refresh, Capture new setup frame, Resume live, and shape-change ROI confirmation.
  - Existing ROI numeric controls remained populated after frozen Capture new setup frame.
  - The mocked preview-image route had one earlier image-route console error during setup of the mock, but the state/metadata/ROI flow was verified through DOM snapshots; this is not a real backend or app runtime error.
- Result: PARTIAL PASS
- Evidence:
  - `output/playwright/p0045_setup_real_camera_live_unavailable_freeze_disabled.png`
  - `output/playwright/p0045_setup_real_camera_live_freeze_mocked_frame_flow.png`

#### Browser retest log — Real camera shared ROI editor

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8033/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup / Run
- Steps:
  1. Start backend on `8033` and frontend on CORS-allowed `5174` with `VITE_G3_API_BASE=http://127.0.0.1:8033`.
  2. Open Setup and click `Real camera`.
  3. Confirm real backend no-hardware path shows structured unavailable state and keeps Offline dataset list available.
  4. Install Playwright routes for `/api/camera/preview` and `/api/camera/preview.png` that return mocked real-camera frames with shape `1364 x 2048`.
  5. Click `Refresh frame` and confirm Setup shows `camera_status = ok`, model, serial_number, ip, pixel_format, frame shape, timestamp and ROI overlay on the Real camera preview frame.
  6. Resize browser viewport from `1280 x 900` to `960 x 700` and back; confirm ROI center/width/height/angle source-pixel values remain unchanged.
  7. Drag shared ROI editor move handle, resize handle and rotate handle on the Real camera frame.
  8. Confirm Live-mode ROI commit refreshes timestamp after pointer up, while drag does not require per-mousemove preview refresh.
  9. Click `New / reset ROI` and confirm default source-pixel ROI returns to center `1024, 682`, size `1269.76 x 381.92`, angle `0`.
  10. Click `Freeze`, drag ROI on the frozen frame and confirm ROI values change while `Timestamp` and `Frozen timestamp` stay fixed.
  11. Click `Capture new setup frame` while Frozen and confirm timestamp updates while current ROI values remain.
  12. Open Run from the current Real camera Setup state, intercept `/api/real-camera-runs`, and assert the request body uses the Setup measurement_definition with `source = real_camera`, `measurement_coordinates = source_pixel`, detector/object/width_mode/config and the current ROI.
- Expected: Real camera Setup uses the same ROI editor as Offline dataset; ROI is source-pixel stable across display sizes; Live commit refreshes latest setup frame; Frozen editing does not refresh until Capture new setup frame; formal run consumes Setup measurement_definition and does not use a Run-page preview.
- Actual:
  - Real no-hardware path displayed `camera_status = unavailable`, metadata fields, `Preview refresh = Camera unavailable`, structured JSON error and an unavailable preview placeholder; Offline dataset rail remained usable.
  - Mocked Real camera frame displayed with shared ROI overlay and editable move/resize/rotate handles.
  - ROI values stayed unchanged across viewport resize: center `1024, 682`, size `1269.76 x 381.92`, angle `0`.
  - Live move/resize/rotate updated ROI source-pixel values and Live move commit advanced timestamp from `1779445963000` to a later mocked timestamp.
  - `New / reset ROI` restored the source-pixel default ROI.
  - Frozen ROI move changed ROI to center `957.46, 726.36`, size `1269.76 x 381.92`, angle `0`; timestamp and frozen timestamp stayed `1779446036000`.
  - Frozen `Capture new setup frame` advanced timestamp/frozen timestamp to `1779446037000` and preserved the ROI.
  - Intercepted `/api/real-camera-runs` request contained `measurement_definition.source = real_camera`, `measurement_coordinates = source_pixel`, ROI `{center_x: 957.46, center_y: 726.36, width: 1269.76, height: 381.92, angle_deg: 0}`, `detector = BalloonEnvelopeDetector`, and `width_mode = max_width`.
- Result: PARTIAL PASS
- Evidence:
  - `output/playwright/p0045_setup_real_camera_unavailable.png`
  - `output/playwright/p0045_setup_real_camera_roi_editor_mocked_live.png`
  - `output/playwright/p0045_setup_real_camera_roi_editor_mocked_frozen.png`

#### Browser retest log — Real camera setup parameter refresh rules

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8033/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup
- Steps:
  1. Start backend on `8033` and frontend on CORS-allowed `5174` with `VITE_G3_API_BASE=http://127.0.0.1:8033`.
  2. Open Setup, select `Real camera`, then install Playwright routes for `/api/camera/preview` and `/api/camera/preview.png` with mocked frame shape `1364 x 2048`.
  3. Click `Refresh frame` and confirm live real-camera setup frame, metadata and ROI overlay are displayed.
  4. Wait for one normal 1 fps Live poll, then change `Min component` and commit with Enter.
  5. Confirm timestamp advances from `1779448004000` to `1779448005000`, proving preview-affecting detector_config changes refresh the latest frame in Live mode.
  6. Change `Envelope window`, `Envelope step`, and `Mask open` in quick succession; confirm the debounce collapses the burst to 1 extra preview request.
  7. Change `Object class` to `C_BUNDLE_ENVELOPE`; confirm timestamp advances from `1779448008000` to `1779448009000` and detector defaults to `BundleEnvelopeDetector`.
  8. Click `Freeze`; confirm page shows `Preview mode = Frozen frame`, `Live refresh = Paused`, and frozen-frame guidance.
  9. While Frozen, change `Mask close`, `Target °C`, and `Power %`.
  10. Confirm preview request count remains `9`, timestamp remains `1779448009000`, and Frozen frame is not replaced.
- Expected: Live mode refreshes latest frame only for ROI/detector-preview-affecting changes, with debounce/apply timing; Freeze mode updates parameters on the frozen frame without auto-refresh; temperature settings do not trigger camera refresh.
- Actual:
  - `Min component` refresh: preview count `4 -> 5`, timestamp `1779448004000 -> 1779448005000`.
  - Detector config burst refresh: `Envelope window`, `Envelope step`, and `Mask open` caused `burstPreviewRequests = 1`.
  - `Object class` switch refreshed timestamp `1779448008000 -> 1779448009000` and set detector to `BundleEnvelopeDetector`.
  - Frozen state displayed the guidance: `Frozen frame: ROI and detector parameters update on the frozen image. Use Capture new setup frame or Resume live to view the latest camera frame.`
  - Frozen `Mask close` plus temperature target/power edits kept preview count `9 -> 9` and timestamp `1779448009000 -> 1779448009000`.
- Result: PARTIAL PASS
- Evidence:
  - `output/playwright/p0045_setup_real_camera_param_refresh_frozen.png`

#### Browser retest log — Real camera setup probe current frame

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8034/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup
- Steps:
  1. Start backend on `8034` and frontend on `5174` with `VITE_G3_API_BASE=http://127.0.0.1:8034`.
  2. Install Playwright routes for `/api/camera/preview` and `/api/camera/setup-probe` to provide deterministic mocked Real camera setup frames and DetectionResult payloads.
  3. Open Setup, select `Real camera`, and confirm mocked preview metadata appears.
  4. Click `Probe current frame` in Live mode.
  5. Confirm the setup-probe request sends `measurement_definition.source = real_camera` and does not upload `frame_png_data_url`, so backend is responsible for grabbing the latest frame.
  6. Confirm Setup displays backend `VALID`, `distance_px = 50.00 px`, A/B overlay data, and debug_artifacts.
  7. Click `Freeze`, then click `Probe current frame`.
  8. Confirm the setup-probe request sends `measurement_definition.source = real_camera` plus current setup frame `frame_png_data_url`.
  9. Return mocked backend `INVALID` with `rejected_reason = fixture no target`.
  10. Confirm Setup displays `INVALID` and `fixture no target` without fabricating A/B/distance.
- Expected: Real camera Setup has a Probe current frame action; Live probe captures latest frame through backend; Freeze probe uses the frozen/setup frame; every probe sends measurement_definition; DetectionResult, rejected_reason and debug_artifacts are displayed only as Setup diagnostics and are not written to a run manifest.
- Actual:
  - Preview requests: `2`.
  - Setup probe requests: `2`.
  - Live probe request had `measurement_definition.source = real_camera` and `liveHasFrameUpload = false`.
  - Frozen probe request had `measurement_definition.source = real_camera` and `frozenHasFrameUpload = true`.
  - Live probe UI displayed `VALID` and `50.00 px`.
  - Frozen probe UI displayed `INVALID` and `fixture no target`.
  - The browser flow did not call `/api/real-camera-runs`; probe remained a Setup-only diagnostic action.
- Result: PARTIAL PASS
- Evidence:
  - `output/playwright/p0045_setup_real_camera_probe_invalid.png`

#### Browser retest log — Formal Run consumes Setup measurement definition

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8034/`
- Dataset: `golden_a_20260522_dev_lab` plus mocked `real_camera` run response
- Page: Setup / Run
- Steps:
  1. Start backend on `8034` and frontend on `5174` with `VITE_G3_API_BASE=http://127.0.0.1:8034`.
  2. Install Playwright routes for `/api/camera/preview`, `/api/real-camera-runs`, and `/api/runs/{run_id}/frames/3.png`.
  3. Open Setup, select `Real camera`, and adjust/save setup values including ROI, `max_frames_per_run = 160`, `live_offline_fps = 8`, `target_temperature_celsius = 42.5`, and `temperature_power_percent = 55`.
  4. Open Run and confirm Setup Summary shows Source, ROI center/size/angle, object_class, detector, width_mode, max_frames_per_run, target_fps, target_temperature_celsius, and temperature_power_percent from the saved Setup measurement.
  5. Click `Start real camera run`.
  6. Inspect intercepted `/api/real-camera-runs` request body.
  7. Confirm the displayed frame title and image source use the backend run artifact, not the currently selected offline dataset frame.
  8. Confirm Run canvas is read-only with no ROI editing handles, and offline source still shows the existing Live Offline Run flow when switching back to `Offline dataset`.
- Expected: Run page is a formal execution page only; real-camera run posts exactly the Setup `measurement_definition`; right-side frame canvas displays `/api/runs/{run_id}/frames/{frame_index}.png` with backend overlay/status; Run does not expose ROI editing.
- Actual:
  - Setup Summary displayed `Source = Real camera`, `Source ID = real_camera`, ROI fields, `Object class`, `Detector`, `Width mode`, `max_frames_per_run = 160`, `target_fps = 8`, `target_temperature_celsius = 42.50 °C`, and `temperature_power_percent = 55 %`.
  - Intercepted `/api/real-camera-runs` request body contained `measurement_definition.source = real_camera`, `measurement_definition.measurement_coordinates = source_pixel`, `target_temperature_celsius = 42.5`, `temperature_power_percent = 55`, `max_frames = 160`, and `target_fps = 8`.
  - Run result displayed `Real camera run · run-real_camera-formal-fixture-2 · frame 3`.
  - Browser requested `/api/runs/run-real_camera-formal-fixture-2/frames/3.png`; the page had one run-frame image element and no offline dataset frame fallback.
  - Backend-provided result fields displayed `distance = 66.00 px`, `temperature = 23.40 °C`, and `sync = TEMP_SYNC_OK`.
  - `FrameCanvas` on Run was read-only; ROI edit handles count was `0`.
  - Switching back to `Offline dataset` showed `Source = Offline dataset`, `Source ID = golden_a_20260522_dev_lab`, `Live Offline Run`, and `Start full offline run`.
- Result: PARTIAL PASS
- Evidence:
  - `output/playwright/p0045_run_real_camera_setup_summary_formal_result.png`

#### Browser retest log — Setup temperature control does not refresh real-camera frame

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5174/`
- Backend URL: `http://127.0.0.1:8034/`
- Dataset: `golden_a_20260522_dev_lab` plus mocked `real_camera` preview/run and mocked LU92XX unavailable response
- Page: Setup / Run
- Steps:
  1. Install Playwright routes for successful `/api/camera/preview`, unavailable `/api/temperature/status`, empty `/api/temperature/serial-ports`, successful `/api/real-camera-runs`, and `/api/runs/{run_id}/frames/1.png`.
  2. Select `Real camera` in Setup and confirm Temperature Control shows `/dev/cu.usbserial-1210 not found`.
  3. Freeze the setup frame.
  4. Click `Read temp`, click `Ports`, edit `target_temperature_celsius = 42.5`, and edit `temperature_power_percent = 55`.
  5. Confirm camera preview request count does not increase after the temperature actions.
  6. Open Run, start real-camera run, and inspect the request body/result display.
- Expected: Temperature controls live in Setup; unavailable temperature controller is visible there; temperature actions do not refresh the real-camera frame; Run uses Setup target/power and has no Read temp / Ports controls.
- Actual:
  - Setup Temperature Control displayed `Status = unavailable`, `Current = None`, `Ports = None`, `Port count = 0`, and structured `/dev/cu.usbserial-1210 not found`.
  - `previewRequests = 2`, `previewAfterFreeze = 2`, `previewAfterTempActions = 2`.
  - Run request included `measurement_definition.detector_config.target_temperature_celsius = 42.5` and `temperature_power_percent = 55`.
  - Run displayed `TEMP_SYNC_MISSING`; formal `analysis_result.temperature_distance` was empty; Run page text did not contain `Read temp`.
  - Result frame used `/api/runs/run-real_camera-temp-setup-fixture/frames/1.png?max_width=1024`; ROI edit handle count was `0`.
- Result: PASS for mocked Setup/Run flow; true LU92XX chain remains blocked under P-0020.
- Evidence:
  - `output/playwright/p0045_setup_temperature_control_unavailable.png`
  - `output/playwright/p0045_setup_temperature_control_unavailable_run_formal.png`

#### Browser retest log — Real hardware Setup→Run full flow

- Retest date: 2026-06-08
- Browser: Playwright MCP Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5177/`
- Backend URL: `http://127.0.0.1:8032/`
- Dataset: `real_camera`
- Page: Setup / Run
- Steps:
  1. Open `http://127.0.0.1:5177/`, enter Setup, and select `Source = Real camera`.
  2. Confirm Setup automatically displays a real Hik camera frame and metadata.
  3. Click `Freeze`, confirm frozen mode and frozen timestamp, then create/reset and adjust ROI on the frozen frame.
  4. Click `Capture new setup frame` while frozen and confirm the latest frame is fetched while ROI remains in source-pixel coordinates.
  5. Change detector parameter `Min component`; confirm Frozen frame guidance and no automatic frame replacement.
  6. Change `target_temperature_celsius` / `temperature_power_percent`, click `Read temp` and `Ports`, and confirm no camera preview refresh.
  7. Open Run and confirm Setup Summary is populated from the saved Setup `measurement_definition`.
  8. Click `Start real camera run`, wait for completion, inspect POST `/api/real-camera-runs`, inspect `GET /api/runs/run-real_camera-20260607T175434488916Z`, and verify the displayed run-frame URL.
- Expected: Setup Real camera behaves as a formal source with Live/Frozen setup frames, source-pixel ROI, detector refresh rules, non-refreshing temperature controls, and formal Run consuming exactly the Setup `measurement_definition`.
- Actual:
  - Setup auto-preview displayed `camera_status = ok`, model `MV-CA060-11GM`, serial `00J67378626`, IP `192.168.3.211`, `pixel_format = mono8`, frame shape `1364 × 2048`, timestamp, and preview refresh status.
  - Freeze displayed `Preview mode = Frozen frame`, `Frozen timestamp = 1780854696122`, and `Live refresh = Paused`.
  - ROI was adjusted through Setup controls to source-pixel `center_x = 960`, `center_y = 700`, `width = 900`, `height = 300`, `angle_deg = -4.5`.
  - Frozen `Capture new setup frame` advanced timestamp to `1780854783058` and preserved the ROI unchanged.
  - Frozen detector edit and all temperature actions produced `0` `/api/camera/preview` requests; the page displayed the Frozen frame guidance.
  - Temperature Control displayed LU92XX unavailable and showed only `/dev/cu.Bluetooth-Incoming-Port` and `/dev/cu.debug-console`; `/dev/cu.usbserial-1210` was absent.
  - Run Setup Summary showed Real camera source, ROI `960.00, 700.00 / 900.00 × 300.00 / -4.50°`, `A_BALLOON_ENVELOPE`, `BalloonEnvelopeDetector`, `max_width`, `max_frames_per_run = 160`, `target_fps = 8`, `target_temperature_celsius = 42.50 °C`, and `temperature_power_percent = 55 %`.
  - Intercepted `/api/real-camera-runs` request body contained Setup `measurement_definition.source = real_camera`, `measurement_coordinates = source_pixel`, the same ROI, `min_component_area_px = 95`, `target_temperature_celsius = 42.5`, and `temperature_power_percent = 55`.
  - Run result title displayed `Real camera run · run-real_camera-20260607T175434488916Z · frame 160`; run-frame image source was `/api/runs/run-real_camera-20260607T175434488916Z/frames/160.png?max_width=1024`, not an offline dataset frame.
  - `run_manifest.measurement_definition.roi` matched Setup; 160 `FrameRecord`, 160 `TemperatureRecord`, and 160 `DetectionResult` were saved.
  - `analysis_result.temperature_distance` had `0` points; no `TEMP_SYNC_MISSING` / `TEMP_SYNC_STALE` point entered the formal temperature-distance / Af curve.
- Result: PASS
- Evidence:
  - `output/playwright/p0045_real_camera_setup_live_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_before_roi_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_roi_adjusted_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_refresh_roi_kept_20260608.png`
  - `output/playwright/p0045_real_camera_setup_frozen_params_temperature_20260608.png`
  - `output/playwright/p0045_real_camera_run_setup_summary_before_start_20260608.png`
  - `output/playwright/p0045_real_camera_run_result_20260608.png`
  - `output/hardware/p0045_real_camera_setup_run_summary_20260608.json`
  - `output/runs/run-real_camera-20260607T175434488916Z/run_manifest.json`
  - `output/runs/run-real_camera-20260607T175434488916Z/analysis_result.json`

#### Remaining issues

真实 Hik 相机 Setup→Run 已通过本次真实浏览器复测。P-0045 的 Setup source / preview / Freeze / ROI / 参数刷新 / Run formal measurement_definition 范围内无剩余阻塞；LU92XX 控制器未连接导致的完整温控闭环仍由 P-0020 以 `BLOCKED` 状态跟踪。

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0046 — Run Live Trend Y 轴按 latest window 局部 min/max 自动缩放，放大 1 px 检测抖动

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/curves.ts`, `frontend/src/main.tsx`, `frontend/tests/curveSpecs.test.mjs`
- Found date: 2026-06-07
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户指出 Run 页 Live Trend 的 Y 轴使用当前 latest window 内 raw/reference 数据的局部最小值和最大值自动缩放。对于 G3 的 `source_pixel` max-width 距离数据，1-2 px 的视觉检测抖动是正常量级；如果 Y 轴贴着局部 min/max 缩放，微小抖动会被放大成整张图的剧烈波动，误导操作员判断样品曲线异常。

#### Expected

```text
1. Run Live Trend Y 轴不得直接按 latest window 局部噪声贴边缩放。
2. Y 轴应使用最小显示跨度，默认不低于 40 px。
3. 运行中的 Latest window 应使用 sticky expand 策略：
   - 初始化时以有效 formal/display 数据范围为中心，保证最小跨度。
   - 数据接近 guard band 时扩展显示范围。
   - 运行中不因窗口内数据范围缩小而频繁收缩。
4. 若后端已有 smoothed/grouped formal curve，Y 轴以 formal curve 为主要缩放来源；raw/reference scatter 不应单独拉伸 formal 曲线比例尺。
5. 前端不得重新计算正式 A/B、distance、temperature sync、temperature bin、平滑或 AFAS；只改变展示比例尺。
```

#### Actual

修复前 Run trend Y 轴由当前可见点的 `paddedRange(min, max)` 直接生成。低温段 latest window 中距离只在约 `1018-1019 px` 或 `983-986 px` 附近抖动时，Y 轴会把 1-2 px 变化铺满图高，使 Live Trend 看起来像异常锯齿/大幅波动。

#### Fix summary

1. `frontend/src/curves.ts`
   - 新增 `RunTrendYAxisRange`、`RunTrendYAxisOptions`、`RunTrendStickyYAxisOptions`。
   - 新增 `buildRunTrendYAxisRange()`，对 Run trend Y 轴强制应用 `DEFAULT_RUN_TREND_Y_AXIS_MIN_SPAN_PX = 40`。
   - 新增 `resolveRunTrendStickyYAxisRange()`，在运行中的 latest window 保持 sticky range，只有数据进入 guard band 或越界时才扩展，不随窗口噪声收缩。
   - `buildRunTrendModel()` 输出 `dataYRange`，并在存在 backend smoothed/grouped formal curve 时用 formal 数据作为 Y 轴缩放来源，避免 raw/reference outlier 拉伸主曲线比例尺。

2. `frontend/src/main.tsx`
   - `RunTrendChart` 接收 `runId` 和 `isRunning`。
   - 仅在 `isRunning && mode === "latest"` 时启用 sticky Y 轴。
   - run id 切换时重置 sticky range；停止或切到 full run 时回到静态范围。
   - 通过 `yAxis.rangeOverride` 将 sticky range 传入底层 SVG 模型，不改变后端 analysis payload。

3. `frontend/tests/curveSpecs.test.mjs`
   - 新增 regression：`run trend y axis keeps pixel jitter from filling the plot`。
   - 新增 regression：`run trend sticky y axis expands near guards without shrinking during live updates`。

#### Tests run

```bash
npm test -- --runInBand --test-name-pattern "sticky y axis|run trend y axis"
Result: PASS, 21 tests passed under the filtered command invocation.

npm test -- --runInBand
Result: PASS, 22 tests passed.

npm run build
Result: PASS, TypeScript + Vite production build completed.

git diff --check
Result: PASS.
```

#### Browser retest log

- Retest date: 2026-06-08
- Browser: Playwright Chromium
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run
- Steps:
  1. Open G3 frontend and select `golden_a_20260522_dev_lab`.
  2. Open Run page and start Live Offline Run from frame 1.
  3. During running Latest window, inspect `svg[aria-label="Run temperature-distance trend chart"]`.
  4. Capture Y-axis tick labels, raw/reference point count, formal line point count, latest cursor label, SVG height, and font sizes.
  5. Wait until backend smoothed formal line appears, then repeat SVG inspection and take screenshot.
- Expected: Latest window still uses `Backend smoothed temperature-distance` when available; raw/reference points remain scatter; Y-axis tick span is at least 40 px and does not collapse to the 1-2 px local jitter range.
- Actual:
  - At frame `181`, latest raw distance was `986.00 px`; Y-axis tick labels were `970, 980, 990, 1000, 1010`, so visible tick span was `40 px`.
  - Tick labels were `12px`; axis labels were `13px`; SVG chart height was `420px`.
  - Latest window showed `80` raw/reference points and latest cursor label `frame 181 · 1.20°C · 986.0px`.
  - At frame `444`, backend smoothed formal line was present with `6` line points; Y-axis tick labels remained `970, 980, 990, 1000, 1010`, span `40 px`.
  - The chart caption remained `Backend smoothed temperature-distance`; active window was `Latest window`.
- Result: PASS
- Evidence:
  - `output/playwright/p0046_run_sticky_yaxis_live_latest.png`
  - `output/playwright/p0046_run_sticky_yaxis_live_latest.json`
  - `output/playwright/p0046_run_sticky_yaxis_live_latest_later.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0047 — Playwright 复测中点击 Stop 后 Run 页面仍显示 Running

- Status: OPEN
- Priority: P1
- Module: `frontend/src/main.tsx`, `frontend/src/api/client.ts`, `backend/src/yyt1771_g3/services/live_offline_run_service.py`
- Found date: 2026-06-08
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

在 P-0046 浏览器复测中，Live Offline Run 运行到约 frame `596` 后，Playwright 点击 Run 页 `Stop` 按钮，页面仍显示：

```text
Progress: 596 / 5,807
Current frame: 596
Running
Stop
```

随后通过 DOM `button.click()` 再次触发 Stop，等待 6 秒后页面仍保持 `Running`，没有进入 `stopped` / partial run idle 状态。为避免继续占用 stream，最终关闭浏览器页断开连接。

#### Expected

```text
点击 Stop 后，frontend AbortController 应立即中断 streaming fetch。
页面应进入 stopped 状态，并等待或回填 partial run manifest / analysis result。
Stop 后不应继续显示 Running。
```

#### Actual

本次 Playwright MCP 复测中，Stop 点击未让页面状态退出 Running。该现象可能与自动化点击、stream abort 或 partial run 等待逻辑有关，尚未单独复现和定位。

2026-06-08 P-0049 浏览器复测中再次观察到同类现象：`golden_a_20260522_dev_lab` full run 运行到约 frame `842` 后点击 `Stop`，等待 5 秒后页面仍继续增长到约 frame `919` 并显示 `Running / Stop`。本次未在 P-0049 中修复 Stop，后续仍需单独处理。

#### Suspected cause

待调查。可能相关路径包括：

```text
frontend/src/main.tsx::stopLiveOfflineRun()
frontend/src/main.tsx::startLiveOfflineRun() abort catch 分支
frontend/src/api/client.ts::streamLiveOfflineRun()
backend/src/yyt1771_g3/services/live_offline_run_service.py::iter_live_offline_run_events()
```

#### Fix summary

待实现。

#### Tests run

```bash
尚未为 P-0047 单独运行测试。
```

#### Browser retest log

- Retest date:
- Browser:
- OS:
- Frontend URL:
- Backend URL:
- Dataset:
- Page:
- Steps:
- Expected:
- Actual:
- Result: PASS / FAIL
- Evidence:

#### Final status

OPEN


---

### P-0048 — Offline Probe 请求把前端 setup source 字段发给 backend，导致 422 extra_forbidden

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P0
- Module: `frontend/src/api/client.ts`, `frontend/tests/apiClientUrls.test.mjs`, `frontend/tests/realCameraSetupRunRegression.test.mjs`
- Found date: 2026-06-08
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户在 Setup 页面点击 `Probe current frame` 后，页面顶部报错：

```text
422 Unprocessable Entity:
{"detail":[{"type":"extra_forbidden","loc":["body","measurement_definition","source"],"msg":"Extra inputs are not permitted","input":"offline_dataset"}]}
```

此时页面使用 `golden_a_20260522_dev_lab` 离线模拟素材，前端内部 `MeasurementDefinition` 带有 `source: "offline_dataset"`，但当前 backend `/api/probe` 运行模型拒绝该额外字段。

#### Expected

```text
1. Frontend 可在 UI 状态中保留 setup source，用于 Offline dataset / Real camera 页面分流。
2. 发给 backend 的正式 measurement_definition 必须符合 backend 测量合同。
3. UI-only 字段不得导致 /api/probe、/api/live-offline-runs、/api/live-offline-runs/stream、/api/camera/setup-probe 或 /api/real-camera-runs 422。
4. 前端不得重新计算正式 A/B、distance、temperature sync 或 AFAS；只修正 API payload 序列化边界。
```

#### Actual

修复前 `frontend/src/api/client.ts::probeFrame()`、`createLiveOfflineRun()`、`streamLiveOfflineRun()`、`probeRealCameraSetupFrame()` 和 `createRealCameraRun()` 都把前端 `MeasurementDefinition` 原样序列化为 `measurement_definition`。当 backend 模型不接受 `source` 时，Probe 直接返回 422，无法执行后端 detector。

#### Suspected cause

P-0045 引入 Setup Source 状态后，前端类型 `MeasurementDefinition` 增加了 `source` 字段；该字段用于 UI source 分流，但没有在 API client 边界清洗，导致 UI 状态泄漏到正式 backend measurement payload。

#### Fix summary

1. `frontend/src/api/client.ts`
   - 新增 `backendMeasurementDefinition()`，从 outgoing measurement payload 中移除 UI-only `source` 字段。
   - `probeFrame()`、`createLiveOfflineRun()`、`streamLiveOfflineRun()`、`probeRealCameraSetupFrame()`、`createRealCameraRun()` 统一使用清洗后的 backend measurement definition。
   - 不改 ROI、detector、detector_config、temperature 参数，也不改后端正式计算逻辑。

2. `frontend/tests/apiClientUrls.test.mjs`
   - 新增红绿回归：`offline probe strips setup source before posting backend measurement definition`。
   - 更新 real camera setup/run API 测试：确认 outgoing payload 不带 `source`，但 ROI 和 detector_config 保持不变。

3. `frontend/tests/realCameraSetupRunRegression.test.mjs`
   - 更新 real camera run request regression：source 不发给 backend，但保存的 ROI、detector、target temperature 和 power 参数不被覆盖。

#### Tests run

```bash
npm test -- --runInBand --test-name-pattern "offline probe strips"
Initial RED result: FAIL, request body still had measurement_definition.source = "offline_dataset".

npm test -- --runInBand --test-name-pattern "offline probe strips|real camera setup probe|real camera run posts|real camera run request"
Result: PASS, 32 tests passed under filtered command invocation.

npm test -- --runInBand
Result: PASS, 32 tests passed.

npm run build
Result: PASS, TypeScript + Vite production build completed.

git diff --check
Result: PASS.
```

#### Browser retest log

- Retest date: 2026-06-08
- Browser: Google Chrome via Playwright, isolated headless profile
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Setup
- Steps:
  1. Open G3 frontend.
  2. Confirm `golden_a_20260522_dev_lab` is selected.
  3. Click `Probe current frame`.
  4. Capture `/api/probe` response and page state.
- Expected: `/api/probe` returns 200; page does not show 422; Setup result shows backend detection status and distance.
- Actual:
  - `/api/probe` returned HTTP `200 OK`.
  - Page did not contain `422 Unprocessable Entity`.
  - Setup result showed `Status = VALID`, `Distance = 989.00 px`, `Temperature = 1.40 °C`, `Sync = TEMP_SYNC_STALE`.
  - Response `measurement_definition` did not include `source`; ROI and detector_config were preserved.
- Result: PASS
- Evidence:
  - `output/playwright/p0048_probe_current_frame_no_source_422.png`
  - `output/playwright/p0048_probe_current_frame_no_source_422.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0049 — Run/Analysis temperature-distance X 轴不应使用 Latest window 或局部温度窗口

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/curves.ts`, `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/tests/curveSpecs.test.mjs`
- Found date: 2026-06-08
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户确认 Run 页不需要 `Latest window / Full run` 交互切换。实际操作员在 run 正在进行时也要看本次 run 从开始到当前最新 frame / 最新温度为止的完整累计 temperature-distance 趋势。

当前实现仍保留 `Latest window / Full run` segmented control，并在 `buildRunTrendModel()` 中按最近点窗口截取 reference points；同时 `filterRunTrendCurveWindow()` 会用 latest reference 温度范围裁剪 backend smoothed/grouped formal curve，导致 Run 页横轴看起来固定在局部温度窗口，例如 `6.50-6.70 °C`，无法看到完整升温过程中的 distance 趋势。

#### Expected

```text
1. Run 页不再渲染 Latest window / Full run 交互按钮。
2. Run 运行中始终显示 current run so far，即从本次 run 开始到当前最新点的全部有效 temperature-distance 数据。
3. Run 停止后显示同一条完整 run 曲线，并以只读状态标签显示 Full run。
4. Run X 轴来自当前全部 observed temperature range，不按最近 N 点或最近 0.2°C 裁剪。
5. backend afas_preprocessing.smoothed / grouped formal curve 不因 latest window 温度范围被前端裁剪。
6. Analysis 默认显示完整 analysis temperature-distance 范围；只有用户主动 brush zoom 后才显示局部范围，Reset zoom 回到完整范围。
7. 前端不得重新计算正式 A/B、distance_px、temperature sync、temperature bin、smooth 或 AFAS。
```

#### Actual

修复前：

```text
1. Run 页运行中默认 Latest window。
2. buildRunTrendModel(mode="latest") 将 reference points 截到最近 80 点。
3. filterRunTrendCurveWindow() 将 backend smoothed/grouped curve 裁剪到 latest reference temperature min/max。
4. Run 页右上角是可交互 segmented control，而不是只读 scope label。
```

#### Suspected cause

P-0039 / P-0046 为实时监护式 Run chart 增加 latest window 与 sticky Y-axis 时，将“最近窗口”作为运行中默认视野；随后用户确认实际实验中 Run 页也应看累计全量趋势，因此旧的 latest-window 假设需要移除。

#### Fix summary

1. `frontend/src/curves.ts`
   - `buildRunTrendModel()` 不再根据 `mode === "latest"` 或 `latestWindowPoints` 截取 reference points。
   - 删除 Run formal curve 的 latest temperature window 裁剪逻辑；backend smoothed/grouped 曲线完整进入模型。
   - X range 改为来自当前全部 visible formal/reference/status temperature values。
   - 保留 sticky Y-axis 最小跨度与扩展策略，不改后端正式计算逻辑。

2. `frontend/src/main.tsx`
   - 移除 Run 页 `Latest window / Full run` segmented control。
   - 新增只读 `Run trend scope` 状态标签：运行中显示 `Current run so far`，停止后显示 `Full run`。
   - `RunTrendChart` 始终用 full/current-run-so-far 模型，sticky Y-axis 在 `isRunning` 时启用。

3. `frontend/src/styles.css`
   - 用 `runTrendStatusLabel` 替代旧 `runTrendMode` segmented 样式，保持朴素浅色工业软件风格。

4. `frontend/tests/curveSpecs.test.mjs`
   - 新增/更新回归测试覆盖 Run 不截取最近 80 点、X range 覆盖完整 observed 温度范围、backend smoothed 不被 latest window 裁剪、Run 源码不再渲染 `Latest window` 控件、Analysis 默认 full range 且 zoom domain 只由显式 `xDomain` 控制。

#### Tests run

```bash
npm test -- --runInBand --test-name-pattern "current run so far|smoothed curve|current-run-so-far|analysis AFAS model separates"
Initial RED result: FAIL, latest mode still returned 80 reference points, smoothed curve was cropped to 26-33.9 °C, and Run source still lacked Current run so far / kept Latest window controls.

npm test -- --runInBand --test-name-pattern "current run so far|smoothed curve|current-run-so-far|analysis AFAS model separates"
Result after fix: PASS, 34 tests passed under filtered command invocation.

npm test -- --runInBand
Result: PASS, 34 tests passed.

npm run build
Result: PASS, TypeScript + Vite production build completed.

git diff --check
Result: PASS.
```

#### Browser retest log

- Retest date: 2026-06-08
- Browser: Google Chrome via Playwright, headless
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run / Analysis / Export
- Steps:
  1. Open frontend and select `golden_a_20260522_dev_lab`.
  2. Start Live Offline Run from frame 1.
  3. Inspect Run chart while running.
  4. Confirm Run has no `Latest window` text or segmented window control.
  5. Confirm Run scope label shows `Current run so far`; later accumulated view shows X ticks extending beyond the former 0.2°C local window.
  6. Set `target_temperature_celsius = 2.00 °C`, run again from frame 1, and let it naturally stop at target temperature.
  7. Confirm stopped Run chart scope label shows `Full run`.
  8. Open Analysis / Export for the completed run.
  9. Confirm Analysis default caption is `Full analysis range`, raw/smoothed layers are visible, and Reset zoom is disabled before brush.
  10. Brush zoom inside the AFAS chart; confirm caption changes to local temperature range and Reset zoom becomes enabled.
  11. Click Reset zoom; confirm caption returns to `Full analysis range` and Reset zoom becomes disabled again.
- Expected:
  - Run uses current-run-so-far/full run data, not latest window.
  - X axis expands with complete observed temperature range.
  - Analysis starts at full range and only switches local after brush; reset restores full range.
- Actual:
  - During running Run, DOM state recorded `hasLatestWindowText=false`, `runStatusLabel=Current run so far`, `references=447`, current frame `448`, current temperature `1.90 °C`, and X tick labels `1.20, 1.40, 1.60, 1.80, 2.00`.
  - A later live snapshot at frame `506` showed X axis spanning approximately `1.00-2.00 °C` and `Temp-distance points=505`, with no `Latest window` control.
  - The target-temperature run naturally stopped at `470 / 470`; Run scope label showed `Full run`, and `Temp-distance points=469`.
  - Analysis for `run-golden_a_20260522_dev_lab-20260608T020058125637Z` showed `Formal temp-distance points=469`, `AFAS status=ok`, `Raw points=469`, `Smoothed points=29`, caption `Full analysis range`, and X tick labels `1.50, 2.00`.
  - Brush zoom changed the caption to `1.41-1.81 °C` and enabled Reset zoom.
  - Reset zoom restored caption to `Full analysis range`, disabled Reset zoom, and kept `rawPoints=469` / `smoothedLineCount=1`.
  - During an exploratory long run, clicking Stop again reproduced existing P-0047; this was not part of the P-0049 fix and remains tracked separately.
- Result: PASS
- Evidence:
  - `output/playwright/p0049_run_current_run_so_far_full_xrange.png`
  - `output/playwright/p0049_run_full_xrange_state.json`
  - `output/playwright/p0049_analysis_full_xrange_reset_zoom.png`
  - `output/playwright/p0049_analysis_full_xrange_reset_state.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0050 — Run/Analysis temperature-distance Y 轴需兼顾完整范围、最小细节跨度和 outlier 抑制

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/curves.ts`, `frontend/tests/curveSpecs.test.mjs`
- Found date: 2026-06-08
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户确认 Run / Analysis 页 temperature-distance 曲线的 Y 轴既不能按局部 raw 噪声贴边缩放，也不能被单个 raw/reference outlier、Analysis outlier、baseline/tangent 远端或 marker 值撑到不合理范围。否则会出现两类误导：

```text
1. 1-2 px 检测抖动被放大成整张图的剧烈波动。
2. 全量 Y 范围被异常点或辅助拟合元素拉得过大，正式 smoothed/grouped 曲线被压成几乎不可见的一条线。
```

#### Expected

```text
1. Run 页继续使用 sticky auto-scale with minimum visible span。
2. Run Y 轴缩放来源优先使用 backend afas_preprocessing.smoothed，其次 grouped，最后 valid raw/reference points。
3. TEMP_SYNC_STALE、TEMP_SYNC_MISSING、INVALID 点不得作为正式曲线，也不应单独决定 Y 轴范围。
4. 单个 raw/reference outlier 不应触发 Run Y 轴扩展。
5. 运行中 Y 轴只按 guard band 扩展，不随局部数据范围变小频繁收缩。
6. Run 保留不低于 40 px 的最小显示跨度。
7. Analysis 默认显示完整 analysis temperature-distance 范围。
8. Analysis 默认 Y 轴主要由 smoothed/grouped formal curve 和可见非 outlier raw points 决定。
9. baseline、tangent、As/Af marker、max slope marker 和 outliers 不得把 Y 轴撑到不合理范围。
10. Analysis brush zoom 后 Y 轴按 zoom 内 formal/smoothed 数据重新适配并保持最小显示跨度；Reset zoom 后回完整 analysis 范围。
11. Raw layer 关闭时，raw points 不应继续影响 Analysis 当前 Y 轴范围。
12. 前端不得重新计算正式 A/B、distance_px、temperature sync、temperature bin、smooth 或 AFAS。
```

#### Actual

修复前风险：

```text
1. Run raw/reference fallback 场景下，单个 raw outlier 可能把 Y 轴拉到很大范围。
2. Analysis yRange 会被 outlier、baseline/tangent 远端或 extreme marker 影响。
3. Analysis brush zoom 后的局部范围缺少统一最小 Y 轴跨度保护。
4. Raw layer 关闭后，raw points 仍可能参与当前 Analysis Y 轴计算。
```

#### Suspected cause

P-0039、P-0040、P-0046、P-0049 已经把 Run / Analysis 曲线改成工业 trend chart 和 AFAS review chart，但 Y 轴范围计算仍需要进一步区分主信息层和辅助诊断层：formal smoothed/grouped curve 是主缩放来源，raw scatter、outliers、fit lines 和 markers 是显示层，不应默认主导比例尺。

#### Fix summary

1. `frontend/src/curves.ts`
   - 新增/完善 Run 与 Analysis Y 轴范围 helper：`buildRunTrendYAxisRange()`、`resolveRunTrendStickyYAxisRange()`、`buildAnalysisAfasYAxisRange()`。
   - Run `buildRunTrendModel()` 的 `dataYRange` 优先来自 backend smoothed/grouped formal curve；仅无 formal curve 时回退到 valid raw/reference，并用显示层 outlier 过滤避免单点撑大比例尺。
   - Run 保留 `DEFAULT_RUN_TREND_Y_AXIS_MIN_SPAN_PX = 40` 与 sticky guard band 扩展策略。
   - Analysis 默认 yRange 使用 visible smoothed/grouped + non-outlier raw；无 formal 数据时才回退 raw。
   - Analysis outlier 点、raw scatter 和 marker 在显示时可 clamp 到图内，但不默认撑大 yRange；baseline/tangent 只显示对应拟合/判定层，不参与无限延长线范围。
   - Raw layer 关闭时，raw points 不再影响 Analysis 当前 yRange。

2. `frontend/tests/curveSpecs.test.mjs`
   - 新增/更新回归测试覆盖 Run 1-2 px 抖动最小 Y 轴跨度、单个 raw outlier 抑制、formal curve 接近边界时 sticky 扩展、Analysis 默认不被 tangent/baseline/marker/outlier 撑大、brush zoom 后重适配、reset 恢复 full range、Raw layer 关闭后 raw 不参与 yRange。

#### Tests run

```bash
npm test -- --runInBand --test-name-pattern "y axis ignores|y axis refits|raw reference outlier"
Initial RED result: FAIL, 4 targeted regressions failed as expected before the Y-axis implementation.

npm test -- --runInBand --test-name-pattern "y axis ignores|y axis refits|raw reference outlier"
Result after fix: PASS, 38 tests passed under filtered command invocation.

npm test -- --runInBand
Result: PASS, 38 tests passed.

npm run build
Result: PASS, TypeScript + Vite production build completed.

git diff --check
Result: PASS.
```

#### Browser retest log

- Retest date: 2026-06-08
- Browser: Google Chrome via Playwright, headless
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run / Analysis / Export
- Steps:
  1. Open G3 frontend and confirm `golden_a_20260522_dev_lab` is selected.
  2. Set `target_temperature_celsius = 2.00 °C`.
  3. Open Run and start Live Offline Run from frame 1.
  4. During running, inspect `svg[aria-label="Run temperature-distance trend chart"]` and capture Y tick labels.
  5. Let the run naturally stop at target temperature instead of using the known P-0047 Stop path.
  6. Capture stopped Run chart state.
  7. Open Analysis / Export for the completed run.
  8. Confirm Analysis default chart is `Full analysis range`, raw/smoothed/fit/marker layers are visible, and Reset zoom is disabled.
  9. Brush zoom inside the AFAS chart and capture Y tick labels.
  10. Click Reset zoom and confirm full range returns.
  11. Turn off Raw layer and confirm raw points no longer influence Analysis Y-axis range.
- Expected:
  - Run running/stopped Y axis uses formal-first sticky/min-span strategy and does not collapse to 1-2 px jitter.
  - Analysis default Y axis is not stretched by tangent/baseline/markers/outliers.
  - Analysis brush zoom refits Y axis locally with minimum span, Reset zoom restores full range, Raw hidden excludes raw from current yRange.
- Actual:
  - Run running at frame `126` showed `Temp-distance points = 125`; Y tick labels were `970, 980, 990, 1000, 1010`, span `40 px`.
  - The target-temperature run naturally stopped at `470 / 470`; latest temperature was `2.00 °C`, latest distance was `984.00 px`, and `Temp-distance points = 469`.
  - Analysis for `run-golden_a_20260522_dev_lab-20260608T023949930901Z` showed `Formal temp-distance points = 469`, `AFAS status = ok`, `Raw points = 469`, `Outliers = 0`, and caption `Full analysis range`.
  - Analysis default Y tick labels were `975, 980, 985, 990, 995, 1000`, span `25 px`; tangent/baseline/As/Af/max slope were visible without stretching the axis.
  - Brush zoom enabled Reset zoom and showed local Y tick labels `975, 980, 985, 990, 995`, span `20 px`.
  - Reset zoom returned to `Full analysis range`, disabled Reset zoom, and restored Y tick labels `975, 980, 985, 990, 995, 1000`.
  - With Raw layer turned off, checkboxes showed `Raw = false`, `Fit = true`, `Markers = true`; Y tick labels were `975, 980, 985, 990, 995`, span `20 px`.
- Result: PASS
- Evidence:
  - `output/playwright/p0050_run_yaxis_running.png`
  - `output/playwright/p0050_run_yaxis_full_run.png`
  - `output/playwright/p0050_run_yaxis_full_run_state.json`
  - `output/playwright/p0050_analysis_yaxis_full_range.png`
  - `output/playwright/p0050_analysis_yaxis_zoomed.png`
  - `output/playwright/p0050_analysis_yaxis_zoomed_state.json`
  - `output/playwright/p0050_analysis_yaxis_reset_full_range.png`
  - `output/playwright/p0050_analysis_yaxis_reset_full_range_state.json`
  - `output/playwright/p0050_analysis_yaxis_raw_hidden.png`
  - `output/playwright/p0050_analysis_yaxis_raw_hidden_state.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

### P-0051 — A 类 1461 帧右侧小黑点经前处理连入主体后扩大正式外包络

- Status: OPEN
- Priority: P0
- Module: `backend/src/yyt1771_g3/vision/detectors.py`, `BalloonEnvelopeDetector`
- Found date: 2026-06-08
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户反馈 `golden_a_20260522_dev_lab` 在 Playback 同一 ROI 下：

```text
ROI = center_x 1178.85, center_y 522.29, width 1260.1, height 307.04, angle_deg -8.06
frame 1400: L≈996px
frame 1460: L≈995px
frame 1461: L≈1020px
```

截图显示右侧存在一个小黑点 / speck。frame 1461 中该 speck 被纳入正式 mesh_region / 外包络 row-window，导致正式 `distance_px` 从约 995px 增大到 1020px。

#### Expected

```text
外部 speck / 小黑点 / 游离脏点不得成为 A 类待测物体目标。
如果小黑点无法可靠排除，应 INVALID 或拒绝该候选，而不是输出看似正常但实际偏大的 A/B。
```

#### Actual

使用当前后端正式 detector 重算：

```text
frame 1400: VALID, distance=996.0px, selected row v=189.0, left=97.0, right=1093.0
frame 1460: VALID, distance=995.0px, selected row v=187.0, left=98.0, right=1093.0
frame 1461: VALID, distance=1020.0px, selected row v=209.0, left=99.0, right=1119.0
```

连通域诊断显示当前代码只能过滤“独立小组件”，但 frame 1461 中小黑点已经被 `_dark_foreground_mask()` 的前处理 / closing 后并入主体连通域：

```text
frame 1460:
  main component bbox right=1099
  separate right speck component area=311, bbox x=1111-1127, y=193-221
  target x>=1100 pixels = 0

frame 1461:
  main component bbox right=1127
  target x>=1100 pixels = 368
  x>=1100 bbox local = x 1100-1127, y 192-220
  selected row v=209 uses right quantile 1119px
```

#### Current code handling

当前已有处理：

```text
1. `_largest_mesh_region()` 会按连通域面积、宽高比例筛选主体；独立小 speck 通常会因面积/宽高不足被排除。
2. `_mesh_envelope_rows()` 使用 `envelope_quantile=0.02`，少量离散像素通常不会决定 left/right 分位数。
3. P-0024 曾修复 bbox + margin 回填导致游离 speck 重新进入 mesh_region 的问题。
```

当前缺口：

```text
如果 speck 在前处理阶段被 closing/dilation 或弱边缘连接成主体同一连通域，则上述连通域过滤不再生效。
如果该 speck 在 selected row window 内占比足够高，2% right quantile 仍会被推到 speck 位置，正式 distance 被拉大。
当前没有对 mesh_region 进行“细颈连接/外侧小突起/孤立右侧支撑”的二次剪枝，也没有对单帧 right boundary 突增做候选拒绝。
```

#### Suspected cause

```text
1461 帧右侧 speck 与主体边缘在 enhanced dark mask 中被连接，成为主连通域的一部分。
随后 row-window max-width 选择 v≈209 的窗口，该窗口内 x>=1100 的 speck 像素足以把 right quantile 从约 1093 推到 1119。
```

#### Fix summary

待实现。候选方向：

```text
1. A 类 mesh_region 增加外侧小突起 / 细颈连接剪枝。
2. 对 selected row 的 right/left boundary 增加稳定支撑列检查，类似 C 类 support columns，但按 A 类 row-window 语义实现。
3. 对单帧边界突增且只由小面积外侧区域支撑的候选输出 INVALID 或回退到稳定候选。
```

#### Tests run

```bash
PYTHONPATH=backend/src python3 - <<'PY'
# 重算 golden_a_20260522_dev_lab frame 1400/1460/1461 的 DetectionResult 和 mask 连通域诊断
PY
Result: reproduced frame 1461 VALID distance=1020px, target x>=1100 pixels=368.
```

#### Browser retest log

- Retest date:
- Browser:
- OS:
- Frontend URL:
- Backend URL:
- Dataset: `golden_a_20260522_dev_lab`
- Page: Playback / Run
- Steps:
- Expected:
- Actual:
- Result: PASS / FAIL
- Evidence:

#### Final status

OPEN


---

### P-0052 — Analysis 默认隐藏 raw 灰点并为 As/Af-tan 增加弱化构造线

- Status: RESOLVED_BROWSER_VERIFIED
- Priority: P1
- Module: `frontend/src/curves.ts`, `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/tests/curveSpecs.test.mjs`
- Found date: 2026-06-08
- Last update: 2026-06-08
- Owner/tool: Codex

#### Problem

用户指出 Analysis / Export 页 AFAS temperature-distance 图默认仍显示大量灰色 raw scatter，干扰工程复核；同时 As / Af-tan 只有垂直 rule + badge，缺少能帮助确认判定点位置的弱化切线 / 构造线。

#### Expected

```text
1. Analysis 默认以 backend smoothed/formal curve 为主，绿色/深青色主曲线最醒目。
2. Raw points 默认关闭，不渲染灰色散点；Raw toggle 仍可作为诊断层打开。
3. As 和 Af-tan 均应有对应的 construction guide / tangent guide，用于工程判读确认。
4. construction guide 使用 backend 已有 AFAS tangent / marker 数据生成显示坐标，不得重新拟合正式 AFAS。
5. construction guide 视觉权重低于 smoothed/formal 主曲线和最终 As/Af marker；线宽约 1.5-2px，透明度弱化。
6. Fit 关闭时 baseline、tangent 和 construction guide 隐藏，但 smoothed/formal 主曲线保留。
7. Markers 关闭时 As/Af badge、vertical rule、max slope marker 隐藏，smoothed/formal 主曲线保留。
8. Y 轴继续由 smoothed/formal curve 主导，不因 construction guide 扩大范围。
```

#### Actual

修复前：

```text
1. Analysis `Raw` layer 默认 checked，图上默认显示 raw 灰点。
2. 模型没有 As/Af-tan construction guide 层。
3. UI 初始 state 为 `{ raw: true, fit: true, markers: true }`。
4. 图例中 raw points 与 smoothed curve 同时出现，主次关系不够明确。
```

#### Suspected cause

P-0040 / P-0043 / P-0050 已完成 Analysis AFAS 主图放大、层级和 Y 轴改进，但默认图层状态仍保留 raw scatter 开启；As/Af marker 只表达结果值，没有把后端已有 tangent 与 As/Af 点之间的判读几何关系单独弱化展示。

#### Fix summary

1. `frontend/src/curves.ts`
   - `DEFAULT_ANALYSIS_AFAS_LAYERS.raw` 改为 `false`。
   - 新增 `AnalysisAfasConstructionGuide` 模型层。
   - `buildAnalysisAfasModel()` 在 Fit layer 开启时，基于 backend 已有 tangent line 与 As / Af-tan marker 生成短局部 `as_guide` / `af_tan_guide`。
   - construction guide 裁剪到当前 plot / yRange，不参与 yRange 计算，不重新拟合 AFAS。

2. `frontend/src/main.tsx`
   - Analysis UI 初始 layer state 改为 `{ raw: false, fit: true, markers: true }`。
   - 默认不渲染 raw points。
   - 新增 As/Af construction guide SVG line 渲染，并为 hover 标注 `AFAS construction guide`。
   - Fit off 隐藏 baseline/tangent/construction guide；Markers off 隐藏 As/Af badge/rule 和 max slope marker；smoothed curve 始终保留。
   - 图例调整为主曲线优先，Raw 标注为 diagnostic。

3. `frontend/src/styles.css`
   - raw point 透明度进一步降低。
   - construction guide 线宽 `1.8px`、短虚线、弱透明蓝/橙红。
   - tangent 线宽降至 `2.35px`，避免盖过 `3.8px` smoothed curve。

4. `frontend/tests/curveSpecs.test.mjs`
   - 新增回归测试覆盖默认 raw off、As/Af construction guide 存在、Fit/Markers toggle 行为和 UI 初始状态。

#### Tests run

```bash
npm test -- --runInBand --test-name-pattern "formal curve only|construction guides|independent from fit|raw diagnostics disabled"
Initial RED result: FAIL, 4 targeted tests failed as expected because raw default was true and constructionGuides did not exist.

npm test -- --runInBand --test-name-pattern "formal curve only|construction guides|independent from fit|raw diagnostics disabled"
Result after fix: PASS, 42 tests passed under filtered command invocation.

npm test -- --runInBand
Result: PASS, 42 tests passed.

npm run build
Result: PASS, TypeScript + Vite production build completed.

git diff --check
Result: PASS.
```

#### Browser retest log

- Retest date: 2026-06-08
- Browser: Google Chrome via Playwright, headless
- OS: macOS
- Frontend URL: `http://127.0.0.1:5179/`
- Backend URL: `http://127.0.0.1:8020/`
- Dataset: `golden_a_20260522_dev_lab`
- Page: Run / Analysis / Export
- Steps:
  1. Open G3 frontend and confirm `golden_a_20260522_dev_lab` is selected.
  2. Set `target_temperature_celsius = 2.00 °C`.
  3. Start Live Offline Run from frame 1 and let it naturally stop at target temperature.
  4. Open Analysis / Export for the completed run.
  5. Inspect default AFAS chart layer toggles and SVG layers.
  6. Confirm Raw defaults off and raw points are not rendered.
  7. Confirm smoothed curve, As/Af construction guides, As/Af markers, and Max slope marker are visible.
  8. Turn Fit off; confirm fit lines and construction guides hide while smoothed curve remains.
  9. Turn Fit on and Markers off; confirm As/Af markers and Max slope marker hide while smoothed curve and fit guides remain.
  10. Turn Raw on; confirm raw diagnostic points render as low-opacity grey points.
- Expected:
  - Analysis default chart has no raw grey points.
  - Smoothed/formal curve remains the dominant green line.
  - As and Af-tan each have weak construction guide lines.
  - Construction guides are visually weaker than smoothed curve and do not replace backend AFAS results.
  - Layer toggles behave according to Raw / Fit / Markers semantics.
- Actual:
  - Completed run `run-golden_a_20260522_dev_lab-20260608T034733930099Z` stopped at `470 / 470`, `Temp-distance points = 469`.
  - Analysis showed `AFAS status = ok`, `As = 1.34 °C`, `Af-tan = 1.48 °C`, `Raw points = 469`, `Outliers = 0`.
  - Default toggles: `Raw = false`, `Fit = true`, `Markers = true`.
  - Default SVG: `rawCircles = 0`, `smoothedLines = 1`, `constructionGuides = 2`, `referenceMarkers = 2`, `maxSlopeMarkers = 1`.
  - Default guide labels: `As tangent guide; AFAS construction guide` and `Af-tan tangent guide; AFAS construction guide`.
  - CSS inspection: smoothed stroke width `3.8px`; construction guide stroke width `1.8px`, dashed; tangent stroke width `2.35px`.
  - Fit off: `fitLines = 0`, `constructionGuides = 0`, `smoothedLines = 1`.
  - Markers off with Fit on: `referenceMarkers = 0`, `maxSlopeMarkers = 0`, `constructionGuides = 2`, `smoothedLines = 1`.
  - Raw on: `rawCircles = 469`, raw fill `rgba(91, 103, 116, 0.16)`, raw stroke `rgba(91, 103, 116, 0.22)`.
- Result: PASS
- Evidence:
  - `output/playwright/p0051_analysis_default_no_raw_as_af_guides.png`
  - `output/playwright/p0051_analysis_default_no_raw_as_af_guides_state.json`
  - `output/playwright/p0051_analysis_fit_off_smoothed_retained.png`
  - `output/playwright/p0051_analysis_fit_off_smoothed_retained_state.json`
  - `output/playwright/p0051_analysis_markers_off_guides_fit_on.png`
  - `output/playwright/p0051_analysis_markers_off_guides_fit_on_state.json`
  - `output/playwright/p0051_analysis_raw_diagnostic_on.png`
  - `output/playwright/p0051_analysis_raw_diagnostic_on_state.json`

#### Final status

RESOLVED_BROWSER_VERIFIED


---

## 4. 新问题登记模板

复制以下模板新增问题。

```markdown
### P-XXXX — <简短标题>

- Status: OPEN
- Priority: P0 / P1 / P2
- Module: `<相关模块/文件>`
- Found date: YYYY-MM-DD
- Last update: YYYY-MM-DD
- Owner/tool: Codex / human / other

#### Problem

<描述问题。包括复现步骤、输入数据、当前错误表现。>

#### Expected

<描述应符合的 G3 需求或期望结果。>

#### Actual

<描述实际结果。可附日志、截图、导出文件路径。>

#### Suspected cause

<可选：怀疑原因。不要把猜测当结论。>

#### Fix summary

<修复后填写：改了什么文件、什么逻辑。>

#### Tests run

```bash
<执行过的测试命令>
```

#### Browser retest log

- Retest date:
- Browser:
- OS:
- Frontend URL:
- Backend URL:
- Dataset:
- Page:
- Steps:
- Expected:
- Actual:
- Result: PASS / FAIL
- Evidence:

#### Final status

<只有真实浏览器复测通过后，才能填写 RESOLVED_BROWSER_VERIFIED。>
```
