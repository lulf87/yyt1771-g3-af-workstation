# G3 A/B 检测与整体外包络算法需求 v0.1

更新日期：2026-07-15

## 1. 算法目标

G3 当前不再按 A、C 或 D 类对象分流。唯一正式算法目标是：在可旋转窄测量带内，根据像素亮暗对比提取待测目标的整体外包络支持，并持续输出同一有效扫描行上两个最外侧 A/B 点与 `distance_px`。

```text
当前对象模型：WHOLE_ENVELOPE
当前 detector：ContrastWidestSpanDetector
当前 width mode：max_width
```

旧 `A_BALLOON_ENVELOPE`、`C_BUNDLE_ENVELOPE`、`D_RESERVED_OBJECT` 以及 Balloon/Bundle detector 仅用于历史 run、旧导出和 Golden 回归兼容，不再是当前产品分类或新建测量默认值。

---

## 2. 几何与正式结果定义

```text
rotated ROI 局部宽度轴（u 轴） = A/B 测量轴。
rotated ROI 高度 = 测量带采样宽度。
新建 ROI 默认高度 = 8 px（measurement coordinates）。
正式 A/B = 同一有效扫描行上整体外包络的两个最外侧接触点。
distance_px = A/B 两点在 measurement coordinates 中的欧氏距离。
```

ROI 在数据结构中仍是非零面积 `rotated_rect`，不能保存为零高度几何线。8 px 窄测量带在操作上接近画线，但可对邻近像素进行稳定采样，并避免零宽度变换、命中区域消失和单像素抖动。

---

## 3. 当前正式检测流程

`ContrastWidestSpanDetector` 的正式流程为：

```text
1. 在 source-pixel measurement coordinates 下裁剪并矫正 rotated ROI。
2. 将窄测量带转换为灰度图。
3. 计算带内灰度中位数 background_median。
4. 使用 cutoff = background_median - contrast_threshold 提取暗目标像素。
5. 对目标支持做连通域筛选，排除面积、长度或延展性不足的 speck。
6. 对测量带内每个扫描行使用小型邻域带统计目标支持。
7. 每个有效扫描行只使用该行支持的最左、最右外侧位置，内部空隙不成为 A/B。
8. 在有效扫描行中选择外侧跨度最大的同一行；不得把不同扫描行的左右端点拼接成正式结果。
9. 将局部 A/B 映射回 measurement coordinates，并计算 distance_px。
10. 应用帧间稳定、跳变过滤与 INVALID 规则。
```

前端只负责设置窄测量带和显示后端结果，不得自行计算正式 A/B、distance 或阈值 mask。

---

## 4. 整体外包络原则

必须满足：

```text
A/B 必须位于当前测量带内目标支持的整体最外侧。
内部白色缝隙可以被外包络跨过。
内部暗线、纹理、交叉线和单根细支边界不能成为正式 A/B。
多细支或多线束在测量带内必须视为一个整体目标，不能测单根线宽。
外部 speck、小黑点和灰尘不能扩张整体外包络。
不能使用纯凸包无条件包住大量外部空白。
夹具、连接丝、支撑丝、窄尾和焊点不得决定正式 A/B。
```

操作者应把窄测量带放在有效测量主体上，并避开夹具等非测量结构。窄带用于降低带外噪声，但不能替代连通域筛选、最小支持量、跳变过滤和 INVALID 判定。

---

## 5. 窄测量带要求

```text
默认高度：8 px。
最小交互高度：8 px。
正式存储：非零高度 rotated_rect。
允许操作：移动、沿局部宽度/高度轴缩放、旋转、重设。
坐标：始终保存为 measurement coordinates；浏览器缩放只影响显示。
运行锁定：run 开始后锁定本次测量带快照。
```

高度增大可提高局部缺损时的容错，但会引入更多带外结构；高度缩到 8 px 可最大程度减少带外噪声。算法在带内选择最宽有效扫描行，因此 8 px 是窄带采样，不是把 8 行像素无条件合并成一个大外包络。

---

## 6. 候选与稳定策略

每帧：

```text
1. 生成对比度目标 mask。
2. 为每个有效扫描行生成一个左右外侧跨度候选。
3. 过滤目标支持不足、边界不可信或由孤立噪点形成的候选。
4. 选择 raw_best_candidate。
5. 若多个候选宽度差 <= tie_width_epsilon_px，优先接近上一帧 selected_candidate 的候选。
6. 只有明显更宽或连续 N 帧更优才切换。
7. 跳变过大且证据不足时输出 INVALID，不输出看似正常的错误 A/B。
```

---

## 7. INVALID 规则

以下情况必须输出 INVALID：

```text
未找到满足对比度和最小支持量的目标。
目标仅由外部 speck 或孤立小连通域构成。
整体外包络不可信。
A/B 不是同一有效扫描行的两个外侧接触点。
候选来自内部缝隙、内部暗线或单根细支宽度。
A/B 超出 ROI 或 measurement coordinates。
相邻帧跳变超过限制且没有足够连续证据。
质量评分不足。
```

Invalid 优先原则不变：宁可缺失一个正式曲线点，也不能输出错误距离。

---

## 8. 正式与诊断输出

每帧至少输出：

```text
detection_status
ab_points
distance_px
quality
rejected_reason
selected_detector
contrast_threshold
roi_background_median
contrast_cutoff_gray
mask_pixel_count
valid_scanline_count
selected_scan_v
selected_left_u
selected_right_u
selected_width_px
raw_best_candidate
selected_candidate
measurement_segment
debug_overlay_image（按配置生成）
```

诊断 mask、轮廓框和 overlay 不能替代正式 A/B；正式值始终由 backend detector 生成。

---

## 9. 历史兼容边界

以下值属于 legacy compatibility：

```text
ObjectClass.A_BALLOON_ENVELOPE
ObjectClass.C_BUNDLE_ENVELOPE
ObjectClass.D_RESERVED_OBJECT
DetectorType.BALLOON_ENVELOPE
DetectorType.BUNDLE_ENVELOPE
DetectorType.LEGACY_BUNDLE_ENVELOPE
DetectorType.RESERVED_OBJECT
DetectorMode.C_ENVELOPE_LEGACY
```

兼容要求：

```text
1. 旧 run、旧 ZIP、旧 manifest 必须仍可解析和显示。
2. 历史配置应按原值回放，不得静默改写已有正式结果。
3. 新建测量、当前 Operator 和当前 Engineering Setup 不再提供 legacy 分类或 detector 选项。
4. Golden dataset ID 中的 a/c 仅是不可变历史标识，不表示当前对象分类。
5. 对 legacy 路径的专项回归可以继续显式构造旧 measurement definition，但不得把它设为当前默认。
```

---

## 10. 验收要求

```text
1. 新建测量固定为 WHOLE_ENVELOPE + ContrastWidestSpanDetector + max_width。
2. 新建 ROI 高度为 8 px，且可以移动、旋转和缩放。
3. 浏览器缩放不改变正式 ROI、A/B 或 distance_px。
4. A/B 来自同一有效扫描行的整体外侧跨度。
5. 内部缝隙、纹理、单根细支和外部 speck 不成为正式 A/B。
6. 阈值或 ROI 改变后，当前帧 Probe 由 backend 重新计算。
7. 旧 A/C 数据和旧导出仍可读取，但当前 UI 不再显示 A/C/D 分类选择。
8. golden_a_20260522_dev_lab 与 golden_c_20260529_dev_lab 均通过真实浏览器回归。
```
