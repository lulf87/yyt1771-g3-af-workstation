# REAL_BROWSER_RETEST_CHECKLIST.md

用于每次真实浏览器复测。

## 1. 基本信息

```text
Date:
Browser:
Browser version:
OS:
Frontend URL:
Backend URL:
Dataset:
Problem ID:
Related files:
```

## 2. 页面流程

根据修改内容选择对应页面。

### Setup 页面

```text
[ ] 页面能打开
[ ] 能加载 preview frame
[ ] 能拖拽 rotated ROI
[ ] ROI 缩放/旋转显示正确
[ ] 修改 detector 后当前帧重新检测
[ ] A/B overlay 与后端结果一致
[ ] 诊断面板可展开
```

### Playback 页面

```text
[ ] 能加载 manifest / dataset
[ ] 能查看 first frame / last frame
[ ] 能逐帧跳转
[ ] 每帧显示 temperature / distance / status
[ ] overlay 正确显示 A/B
[ ] INVALID 帧不显示错误正式 A/B
```

### Run 页面

```text
[ ] Live offline run 可启动
[ ] 处理帧率达到 5-10 fps 目标或记录不足原因
[ ] 实时显示 A/B / distance / temperature
[ ] 曲线实时更新
[ ] 停止后保存 run artifact
```

### Analysis / Export 页面

```text
[ ] distance-time 曲线正确
[ ] temperature-time 曲线正确
[ ] temperature-distance 曲线只使用 TEMP_SYNC_OK / TEMP_SYNC_INTERPOLATED
[ ] CSV 可导出
[ ] JSON 可导出
[ ] PNG 曲线图可导出
[ ] 导出数据与 UI 显示一致
```

## 3. 坐标缩放专项复测

涉及 ROI 或 overlay 的修复必须做：

```text
[ ] 浏览器 100% 缩放测一次
[ ] 浏览器 125% 或 150% 缩放测一次
[ ] 改变窗口大小测一次
[ ] 同一 ROI / 同一帧 distance_px 保持一致
```

## 4. 结果记录

将结果写回 `problem.md`：

```text
Result: PASS / FAIL
Evidence:
Notes:
```
