# 多位置 AFAS 详细分析恢复设计

## 目标

在不破坏现有 1–6 位置组合曲线总览的前提下，为“结果与导出”、保存结果重开和历史导入恢复按位置切换的完整 AFAS 详细图，并让参数、保存快照和导入结果保持一致。

## 已确认问题

- 后端仍为每个 `RegionAnalysisResult` 计算并保存 `afas_preprocessing`、`afas_analysis` 和 `summary`。
- `AnalysisAfasChart`、`AfasParameterPanel` 和详细 AFAS 绘制模型仍存在。
- 多位置改造后，操作员结果页和历史导入只挂载 `MultiRegionTrendChart`，因此只能看到组合平滑曲线和数字摘要。
- 现有 `AfasParameterPanel` 读取顶层第一个位置兼容镜像，重分析接口将同一套预处理和切线参数应用到全部位置，尚不支持真正的当前位置独立切线参数。

## 方案选择

### 采用：组合总览 + 单位置详情

上半部分保留现有组合图。下半部分新增共享的多位置 AFAS 详情组件，使用位置标签选择一个 region，并将该 region 的已保存分析字段适配成 `AnalysisAfasChart` 所需的单位置 `AnalysisResult`。

该方案避免在一张组合图上同时绘制最多 12 条基线、6 条切线、12 条 AS/AF 垂直线和大量 marker，也最大限度复用已验证的详细 AFAS 图。

### 不采用：把所有 AFAS 辅助线叠加到组合图

多位置时信息密度过高，无法可靠确认单个位置的拟合区间、交点和切线关系。

### 不采用：为多位置重新开发第二套 AFAS 图

会复制缩放、图层、marker、拟合线和 tooltip 逻辑，容易造成工程分析页与操作员结果页显示不一致。

## 页面结构

结果页面按以下顺序展示：

1. 运行与来源摘要。
2. 每个位置的 AS、AF、ΔT、最大斜率温度和点数卡片。
3. 1–6 位置组合曲线总览。
4. “AFAS 详细分析”区域：位置标签 + 选中位置的 `AnalysisAfasChart`。
5. 参数设置。
6. 导出操作。

历史导入页面采用相同的“组合总览 + 按位置 AFAS 详情”结构。只有 PNG、没有结构化分析数据的旧导入继续显示静态图片和现有提示。

## 组件边界

新增聚焦组件（名称可按现有代码风格微调）：

- `MultiRegionAfasReview`：维护当前选中 `region_id`，渲染位置标签、详细图和当前区域状态。
- `analysisForRegion(analysis, regionId)`：把选中 `RegionAnalysisResult` 映射成详细图使用的单位置 `AnalysisResult`。映射只复制引用或轻量字段，不复制逐帧大型数组。
- `AfasParameterPanel` 增加明确作用域：共享预处理参数和当前位置切线参数，不再隐式读取顶层第一个位置镜像。

当前位置选择规则：

- 默认选择第一个有 AFAS 数据的 region，否则选择第一个 region。
- analysis 或导入文件变化时，如果原选择仍存在则保留，否则回退到默认 region。
- 标签显示位置颜色和本地化名称。
- 多个结果页面不得各自实现不同的 region 适配逻辑。

## 数据流与一致性

### 当前运行和保存后重开

`analysis_summary.json` / summary API 已包含每个 region 的最终 preprocessing、AFAS analysis 和 summary。页面直接读取这些保存快照：

```text
analysis.regions[selected]
  -> analysisForRegion
  -> AnalysisAfasChart
```

不重新检测，不在打开页面时重新平滑或重新计算 AS/AF。

### 历史导入

- v2 导入直接使用 region 内保存的 preprocessing、analysis 和 summary。
- v1 单位置导入由现有兼容层规范化成 `region_1` 后进入同一组件。
- 只有静态 PNG 的历史文件不伪造交互式 AFAS 数据。

### 图表含义

- 组合图继续只做位置间趋势比较。
- 详细图显示选中位置的平滑曲线、原始诊断散点（默认关闭）、异常点、低/高温基线、最大斜率切线、AS/AF 交点及垂直辅助线、最大斜率点、缩放和图层开关。
- marker、辅助线和数值全部来自同一个 region 的 `afas_analysis`，不得读取顶层第一个位置兼容镜像。

## 参数重分析

参数语义分成两类：

- 共享预处理参数：温度分组、异常值修复、Savitzky–Golay 窗口和阶数。默认“应用到全部位置”，确保多位置使用统一预处理口径。
- 位置切线参数：低温区间、高温区间、tangent offset。支持“仅重新分析当前位置”。

后端重分析请求增加显式作用域，而不是只改前端文案：

```json
{
  "region_id": "region_2",
  "apply_preprocessing_to_all_regions": false,
  "afas_preprocessing_parameters": {},
  "afas_analysis_parameters": {}
}
```

行为要求：

- 指定 `region_id` 时只替换该 region 的 preprocessing、analysis 和 summary，其他 region 保持深度一致。
- “应用到全部位置”继续使用全 region 重分析，但每个 region 独立计算结果。
- 返回完整轻量 `AnalysisResult`/summary，前端原子替换当前分析状态。
- v2 存储原子写回 `analysis_summary.json`；v1 继续遵循现有非覆盖历史规则。
- 导入文件默认只读，不提供重分析，除非它已经保存为可重分析 run 并具有有效 run id。

## 错误与空状态

- 选中位置没有足够点时，详细区显示该 region 的 AFAS failure reason，不退回其他位置或顶层镜像。
- 重分析失败保留原图和参数输入，显示明确错误，不清空其他 region。
- region 在新分析结果中消失时回退到第一个有效 region。
- 只有组合 PNG 时不显示空的标签和参数控件。

## 测试设计

### 前端

- 当前结果页和历史导入均同时渲染组合总览与 `MultiRegionAfasReview`。
- 位置标签独立切换，详细图输入只包含选中 region 的 preprocessing、analysis 和 summary。
- 位置 2 的 AS/AF marker 不得读取位置 1 顶层兼容值。
- analysis 替换、保存重开和导入后保留/回退 selection 的规则一致。
- 原始点图层默认关闭，拟合和 marker 默认开启。
- 只有 PNG 的旧导入不显示交互详情。
- 当前区域重分析请求携带 `region_id`；应用全部请求使用显式 all-region 作用域。

### 后端

- region-scoped reanalysis 只改变目标 region，其他 region 深度一致。
- all-region reanalysis 保持当前行为并分别生成每个 region 结果。
- v2 写回后重启读取，选中 region 的 grouped、smoothed、AS、AF 和拟合参数一致。
- v1 单位置兼容继续工作。

### 浏览器验收

使用 `golden_a_20260522_dev_lab` 完成至少 3 个位置的模拟 Run → Stop → Results：

- 组合总览仍显示 3 条位置曲线。
- 逐一切换 3 个位置，详细图显示各自基线、切线、AS、AF 和最大斜率 marker。
- 当前区域重分析只改变目标 region。
- 刷新并重开 run 后详细图和数值一致。
- 导出 ZIP 再导入后，组合图和逐位置详细图一致。
- 控制台无 error/warning，截图和日志登记到 `problem.md`。

## 非目标

- 不修改检测算法、温度同步、跳变过滤或 AFAS 数学公式。
- 不把完整 `all_frames` 恢复到 v2 analysis summary。
- 不在组合图叠加全部位置的 AFAS 构造线。
- 不让前端计算正式 AS、AF 或重新平滑保存结果。
- 不改变原始帧保存策略。

## 完成标准

- 当前结果、保存重开、v1/v2 历史导入共享同一多位置 AFAS 详情组件。
- 每个位置均可独立查看完整 AFAS 图形依据。
- 详细图的 AS/AF 与对应位置摘要一致。
- 当前区域和全部位置重分析具有真实、可测试的后端作用域。
- P-0094 轻量存储和停止性能不回退。
- 前后端自动化、构建和真实浏览器流程全部通过后，问题才能标记 `RESOLVED_BROWSER_VERIFIED`。
