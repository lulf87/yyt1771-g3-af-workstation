# G3 A/B 检测与外包络算法需求 v0.1

## 1. 算法目标

G3 算法目标是识别 ROI 内待测物体整体外包络，并在 A/C 类对象中持续输出整体外包络最大宽度处的 A/B 点和 distance_px。

---

## 2. 核心定义

```text
正式 A/B = ROI 内目标整体外包络最大宽度位置的两个外侧接触点。
A/B 测量轴 = 垂直于 ROI 主方向。
distance_px = A/B 两点欧氏距离。
```

---

## 3. 外包络要求

```text
外包络可以跨过内部缝隙。
不能使用纯凸包无脑包住大量外部空白。
内部暗线、纹理、交叉线不构成正式边界。
外部 speck 不得成为目标。
```

### 3.1 当前归档 A/C 分流实现记录

```text
2026-06-04：根据用户确认，Setup probe 和 Run 逐帧检测统一参考 /Users/lulingfeng/Documents/工作/开发/归档 的轮廓检测方案，并按归档目录分为 A 网格类与 C 线束类。

共同路径：
1. 在 measurement coordinates 下裁剪 rotated ROI。
2. 使用 ROI angle_deg 作为 theta。
3. 前端 Setup / Run 只显示后端 debug_artifacts，不计算正式 distance。
4. debug_artifacts 保存 contour_projection_box / contour_direction_arrow / contour_theta_deg / contour_length_px。

A 类 BalloonEnvelopeDetector：
1. 对 ROI 图像执行暗线增强、滞后阈值、形态学去噪。
2. 选取满足面积、宽度和高度比例的 mesh_region。
3. 使用稳定行窗口 envelope_rows 提取左右整体外包络。
4. distance_px = mesh_region 在同一 selected row/window 上的左右外包络跨度；不同 row/window 的 min-left 与 max-right 只能作为 debug 诊断，不能拼接为正式 A/B。
5. contour_measurement_mode = archived_mesh_envelope_rows。

C 类 BundleEnvelopeDetector：
1. 对 ROI 图像执行暗线增强和线束分割。
2. 保留面积足够或具有细长几何特征的 wire components。
3. 对 wire mask 沿 ROI theta 方向计算稳健 projection bounds。
4. distance_px = projection bounds 的 raw_length。
5. contour_measurement_mode = archived_wire_bundle_projection。
```

---

## 4. BalloonEnvelopeDetector

用于 A 类对象。

必须处理：

```text
白底暗色网状结构增强
网眼内部空白不作为边界
内部暗线 / 交叉线不作为边界
外轮廓弱边缘和局部断裂
底部夹具/连接丝通过 ROI 排除
夹子 / 连接丝 / 支撑丝 / 窄尾不决定 max-width
max-width A/B
```

推荐第一版 pipeline：

```text
1. 在 measurement coordinates 下裁剪 ROI。
2. 通过背景校正或大核形态学闭运算估计白色背景。
3. 计算暗线响应，增强金属网状结构。
4. 使用双阈值滞后保留与强响应连通的弱响应，得到 strut_mask。
5. 使用小核 opening / closing / dilation 去噪并连接网状主体。
6. 选取满足面积、宽度、高度比例的主体连通域，得到 mesh_region。
7. 沿 A/B 测量轴方向建立滑动窗口，统计窗口内 mesh_region 的两侧分位数外包络。
8. 剔除横向跨度过窄或前景像素过稀的窗口，降低夹子、支撑丝、窄尾影响。
9. 在保留窗口中选择同一 selected row/window 的整体 max-width，得到正式 A/B 和 distance_px；不得把不同窗口的 left/right 边界拼接成正式测量线。
10. 可额外生成 outer_contour_debug / filled_contour_debug；debug 轮廓不作为正式 distance_px 的唯一来源。
```

输出：

```text
strut_mask
mesh_region
envelope_rows
left_boundary_px
right_boundary_px
outer_contour_debug
filled_contour_debug
raw_best_candidate
selected_candidate
ab_points
distance_px
quality
rejected_reason
debug_overlay
```

建议最小配置参数：

```text
dark_enhance_bg_kernel_px
hysteresis_low_ratio
mask_open_kernel_px
mask_close_kernel_px
mask_dilate_kernel_px
min_component_area_px
envelope_quantile
envelope_window_px
envelope_step_px
min_window_pixels
window_width_keep_ratio
window_count_keep_ratio
mesh_min_width_ratio
mesh_min_height_ratio
mesh_region_margin_px
mesh_row_width_keep_ratio
mesh_row_count_keep_ratio
debug_contour_close_kernel_px
debug_contour_smooth_window_px
```

---

## 5. BundleEnvelopeDetector

用于 C 类对象。

必须处理：

```text
多细支作为整体目标
相邻细支之间白色间隙视为内部
不测单根线
忽略内部暗线 / 交叉线
外部 speck 排除
max-width A/B
```

推荐第一版 pipeline：

```text
1. 在 measurement coordinates 下裁剪 ROI。
2. 通过大核形态学闭运算估计白色背景。
3. 计算暗线响应并平滑。
4. 使用 Otsu 阈值乘以 threshold_scale，并叠加 min_response，得到 wire mask。
5. 使用小核 closing 桥接短断裂。
6. 连通域按面积、主轴长度和 elongation 保留线束成分，排除 speck。
7. 沿 ROI theta 方向对 wire pixels 做稳健投影，得到 min/max along 与 min/max perpendicular。
8. distance_px 使用 raw_length_along_direction_px；raw_width_perpendicular_px 作为诊断信息保存。
9. debug overlay 显示 projection box、direction arrow 和 theta/L。
```

建议最小配置参数：

```text
dark_enhance_bg_kernel_px
contour_projection_quantile
wire_threshold_scale
wire_min_response
wire_bridge_kernel_px
wire_min_component_area_px
wire_min_length_px
wire_min_elongation
wire_box_padding_px
```

---

## 6. 候选选择

每帧：

```text
1. 在 ROI 内生成 target/envelope 表达；A 类可使用 strut_mask + mesh_region + envelope_rows，C 类可使用 envelope mask。
2. 沿垂直 ROI 主方向扫描候选测量轴或窗口。
3. 每条测量轴/窗口与整体外包络求两个外侧接触点。
4. 计算 width_px。
5. 过滤非法候选。
6. 选择 raw_best_candidate。
7. 应用稳定策略得到 selected_candidate。
```

---

## 7. 稳定策略

```text
如果多个候选宽度差 <= tie_width_epsilon_px，则认为宽度等价。
宽度等价时，优先选择接近上一帧 selected_candidate 的候选。
只有明显更宽或连续 N 帧更优才切换。
跳变过大且质量不足时输出 INVALID。
```

---

## 8. Invalid 规则

以下情况必须 INVALID：

```text
未找到可信目标
外包络不可信
A/B 不在外包络上
候选来自内部缝隙 / 暗线 / 单根线
候选来自外部 speck
跳变超过限制且没有足够证据
ROI 内目标覆盖不足
```

---

## 9. 诊断信息

每帧输出：

```text
detection_status
confidence
edge_strength
contour_area
roi_coverage
jump_from_previous
rejected_reason
selected_detector
preprocessing_parameters
raw_best_candidate
selected_candidate
overlay_debug_image
```
