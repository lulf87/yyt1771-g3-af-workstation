# G3 Golden Dataset Plan v0.1

## 1. 目标

建立可重复的算法验收数据集，覆盖 A 类和 C 类对象。

---

## 2. 每个 golden dataset 目录结构

```text
datasets/golden/<dataset_id>/
  manifest.json
  frames/
  previews/
  measurement_definition.json
  expected_outputs/
    README.md
    expected_summary.json
    expected_curves.csv
```

---

## 3. 必须包含的数据集类型

```text
A_BALLOON_ENVELOPE：球囊 / 网状结构，初始到最终状态。
C_BUNDLE_ENVELOPE：多细支 / 多线束整体，初始到最终状态。
```

---

## 4. 每组数据必须记录

```text
dataset_id
object_class
detector
width_mode
frame_count
frame_shape
temperature_source
ROI 初始建议
first frame
last frame
已知困难点
```

---

## 5. 验收用途

```text
1. detector regression
2. A/B 稳定策略验证
3. ROI 坐标缩放验证
4. temperature-distance 曲线验证
5. export 验证
```


---

## 已确认真实离线 Golden Datasets

### A 类

```text
id: golden_a_20260522_dev_lab
path: /Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab
default_detector: BalloonEnvelopeDetector
default_width_mode: max_width
```

### C 类

```text
id: golden_c_20260529_dev_lab
path: /Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab
default_detector: BundleEnvelopeDetector
default_width_mode: max_width
```

Codex 必须通过 `configs/local/offline_datasets.local.json` 读取这些路径。若路径、manifest、frames 或 temperature.csv 不可访问，必须登记到 `problem.md`。

---

## 6. 已确认本地真实离线素材

G3 第一阶段使用以下两组本地真实离线素材作为 golden/offline validation dataset。Codex 必须通过 `configs/local/offline_datasets.local.json` 读取这些路径，不得在代码中硬编码绝对路径。

```text
配置文件：configs/local/offline_datasets.local.json
离线素材根目录：/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures
```

### 6.1 A 类素材

```text
Dataset ID: golden_a_20260522_dev_lab
Object class: A_BALLOON_ENVELOPE
Path: /Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab
Detector: BalloonEnvelopeDetector
Width mode: max_width
```

### 6.2 C 类素材

```text
Dataset ID: golden_c_20260529_dev_lab
Object class: C_BUNDLE_ENVELOPE
Path: /Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab
Detector: BundleEnvelopeDetector
Width mode: max_width
```

### 6.3 必须用于验收的场景

```text
1. Offline playback 加载 first frame / last frame。
2. Rotated ROI 在浏览器缩放下映射到 measurement coordinates。
3. A 类暗线增强、主体连通域、稳定行窗口/测量轴窗口左右外包络 max-width A/B 检测。
4. C 类整体外包络 max-width A/B 检测。
5. A/B 稳定策略：raw_best_candidate 与 selected_candidate。
6. temperature csv / manifest 温度字段读取。
7. TEMP_SYNC_OK / TEMP_SYNC_INTERPOLATED / TEMP_SYNC_STALE 状态处理。
8. Live offline run 5-10 fps。
9. Analysis 页面绘制 temperature-distance 曲线。
10. Export 导出 CSV / JSON / PNG。
```


---

## 6. 当前已确认的本地真实离线素材

这些素材是 G3 第一阶段的核心 golden source。Codex 必须通过 `configs/local/offline_datasets.local.json` 按 dataset id 读取，不要把绝对路径散落写入业务代码。

| Dataset ID | 类型 | 默认 detector | width mode | 本地路径 |
|---|---|---|---|---|
| `golden_a_20260522_dev_lab` | `A_BALLOON_ENVELOPE` | `BalloonEnvelopeDetector` | `max_width` | `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab` |
| `golden_c_20260529_dev_lab` | `C_BUNDLE_ENVELOPE` | `BundleEnvelopeDetector` | `max_width` | `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab` |

每个目录下预期包含：

```text
manifest.json
frames/frame_*.npy
temperature.csv
```

第一阶段验收时，Offline playback、Live offline run、A/B 稳定策略、temperature-distance 曲线和 Export 至少要覆盖这两组数据。


---

## 6. 已确认本地 Golden Dataset

G3 第一阶段以用户提供的两组真实离线素材作为 golden datasets。Codex 必须通过以下配置读取，不得把路径写死进代码：

```text
configs/local/offline_datasets.local.json
```

| dataset_id | 类型 | 用途 | 本地目录 |
|---|---|---|---|
| `golden_a_20260522_dev_lab` | A 类球囊/网状结构 | `BalloonEnvelopeDetector` + `max_width` 验收 | `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab` |
| `golden_c_20260529_dev_lab` | C 类多细支/多线束整体 | `BundleEnvelopeDetector` + `max_width` 验收 | `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab` |

每个目录包含：

```text
frames/frame_*.npy
temperature.csv
manifest.json
```

用户说明：每组素材约为 1 秒 10 帧。

## 7. Golden Dataset 验收要求

这两个数据集必须用于以下复测：

```text
1. Setup 页面加载预览帧并绘制 rotated ROI。
2. Playback 页面逐帧查看 A/B overlay。
3. Live offline run 按 5-10 fps 输出 distance_px。
4. Analysis 页面显示 distance-time、temperature-time、temperature-distance 曲线。
5. Export 导出 CSV、JSON、PNG。
6. 不同浏览器缩放比例下，正式 distance_px 保持一致。
```

如任一复测失败，必须登记或更新 `problem.md`。
