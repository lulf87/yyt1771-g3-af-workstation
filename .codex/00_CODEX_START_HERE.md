# 00_CODEX_START_HERE.md

Codex 开发本项目时，从这里开始。

## 第一步：读取项目规范

必须先读取：

```text
AGENTS.md
problem.md
docs/requirements/G3_需求规格说明书_v0.1.md
docs/milestones/G3_开发任务拆分_v0.1.md
docs/algorithms/G3_AB检测与外包络算法需求_v0.1.md
docs/data/G3_离线素材注册表_v0.1.md
configs/local/offline_datasets.local.json
```

## 第二步：确认当前 milestone

默认从以下顺序推进：

```text
Milestone 0：Golden Dataset 和验收基准
Milestone 1：新仓库骨架
Milestone 2：核心数据模型
Milestone 3：Offline Playback + ROI
Milestone 4：A/C Detector 原型
Milestone 5：A/B 稳定策略
Milestone 6：温度同步和曲线
Milestone 7：Live Offline Run
Milestone 8：Real Camera Preview / Run
Milestone 9：Export
```

## 第三步：开发中的强制动作

```text
发现问题 -> 登记 problem.md
代码修复 -> 标记 FIXED_PENDING_BROWSER_RETEST
真实浏览器复测通过 -> 标记 RESOLVED_BROWSER_VERIFIED
真实浏览器复测失败 -> 标记 REOPENED
```

## 第四步：绝对不能违反的需求

```text
A/C 只用 max-width。
A/B 只能来自整体外包络。
多细支必须作为整体目标。
前端缩放不得影响正式 distance。
异常帧宁可 INVALID，不输出错误 A/B。
温度 stale 点不得进入正式 Af 曲线。
```


## 本地离线素材配置

开发 Offline Playback、Live Offline Run、A/C detector、temperature-distance 曲线或 regression 测试前，必须读取：

```text
configs/local/offline_datasets.local.json
docs/data/G3_本地离线素材配置_v0.1.md
```

当前本地真实数据集：

```text
golden_a_20260522_dev_lab：类型 A，BalloonEnvelopeDetector，max_width
golden_c_20260529_dev_lab：类型 C，BundleEnvelopeDetector，max_width
```

如果本地数据集路径不存在，必须登记到 `problem.md`，不得静默使用 mock 数据替代。


## 离线素材入口

开始 Offline Playback / Live Offline Run / detector regression 前，先读取：

```text
configs/local/offline_datasets.local.json
docs/data/G3_离线素材登记说明_v0.1.md
```

已登记 golden datasets：

```text
golden_a_20260522_dev_lab -> A 类 -> BalloonEnvelopeDetector -> max_width
golden_c_20260529_dev_lab -> C 类 -> BundleEnvelopeDetector -> max_width
```

任何路径不可访问或数据缺失都必须登记到 `problem.md`。

## 第五步：真实离线素材位置

G3 开发必须优先使用两组真实离线素材作为 A/C 类 golden dataset。Codex 在做 Offline Playback、Live Offline Run、Detector、A/B 稳定性、温度同步和真实浏览器复测前，必须读取：

```text
configs/local/offline_datasets.local.json
```

当前本机路径：

```text
A 类：/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab
C 类：/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab
```

如果路径不存在、manifest/temperature.csv/frames 缺失，必须登记到 `problem.md`。



## 第五步：加载本地离线素材

Offline playback、Live offline run、Re-analysis、detector regression、ROI 坐标测试、temperature-distance 曲线和真实浏览器复测，必须优先使用：

```text
configs/local/offline_datasets.local.json
```

已登记 dataset id：

```text
golden_a_20260522_dev_lab -> 类型 A -> BalloonEnvelopeDetector -> max_width
golden_c_20260529_dev_lab -> 类型 C -> BundleEnvelopeDetector -> max_width
```

不要在代码中重复硬编码绝对路径，应通过 dataset registry 按 id 加载。
