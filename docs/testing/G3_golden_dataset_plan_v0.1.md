# G3 Golden Dataset Plan v0.1

更新日期：2026-07-15

## 1. 目标

建立可重复的整体外包络算法验收数据集，覆盖两组来源结构不同的真实离线素材。当前产品不再按 A/C/D 分类；dataset id 中的 `a` / `c` 是不可变历史标识。

当前回归默认：

```text
object_class: WHOLE_ENVELOPE
detector: ContrastWidestSpanDetector
detector_mode: contrast_widest_span
width_mode: max_width
ROI: 默认 8 px 非零窄测量带
```

旧 `A_BALLOON_ENVELOPE + BalloonEnvelopeDetector` 和 `C_BUNDLE_ENVELOPE + BundleEnvelopeDetector` 只作为 `legacy_profile` 保存，用于旧 run、旧导出和专项历史回归。

---

## 2. 数据目录结构

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

本机真实素材由 `configs/local/offline_datasets.local.json` 注册，可位于仓库外；业务代码、API、UI 和测试必须使用 dataset id，不得硬编码本机绝对路径。

---

## 3. 已确认真实离线素材

| Dataset ID | 当前模型 | 当前 detector | Legacy profile |
|---|---|---|---|
| `golden_a_20260522_dev_lab` | `WHOLE_ENVELOPE` | `ContrastWidestSpanDetector` | `A_BALLOON_ENVELOPE + BalloonEnvelopeDetector` |
| `golden_c_20260529_dev_lab` | `WHOLE_ENVELOPE` | `ContrastWidestSpanDetector` | `C_BUNDLE_ENVELOPE + BundleEnvelopeDetector` |

每个本机目录应包含：

```text
manifest.json
temperature.csv
frames/frame_*.npy
capture.avi（如存在，仅辅助查看）
```

若路径、manifest、frames 或 temperature.csv 不可访问，必须登记到 `problem.md`。

---

## 4. 每组数据必须记录

```text
dataset_id
current object_class / detector / detector_mode / width_mode
legacy_profile
frame_count
frame_shape
temperature_source
窄测量带初始建议
first frame / last frame
已知困难点
```

---

## 5. 必须覆盖的验收场景

```text
1. Offline playback 加载 first frame / last frame。
2. 新建测量为 WHOLE_ENVELOPE + ContrastWidestSpanDetector + max_width。
3. 新建 rotated ROI 高度为 8 px，并可移动、缩放和旋转。
4. 浏览器缩放不改变 measurement coordinates、A/B 或 distance_px。
5. 对比度阈值在窄测量带内形成目标支持。
6. A/B 来自同一有效扫描行的整体最外侧跨度。
7. 内部空隙、内部纹理、单根细支和外部 speck 不成为正式 A/B。
8. raw_best_candidate、selected_candidate、INVALID 和 rejected_reason 正确。
9. temperature.csv / manifest 温度字段和同步状态正确。
10. Live offline run、Analysis、Export 和 Import 流程可用。
11. 旧 A/C measurement definition 和旧导出仍可读取，但当前 UI 不再提供分类或旧 detector 选择。
```

整体外包络或窄测量带改动必须同时复测两个 dataset，并把浏览器、步骤、结果和证据路径登记到 `problem.md`。
