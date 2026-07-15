# Golden Dataset 本地映射

G3 使用两组真实离线素材作为 golden datasets。由于原始 `.npy` 帧文件体积较大，不建议复制进仓库；项目通过本地配置文件引用原始目录。

正式配置文件：

```text
configs/local/offline_datasets.local.json
```

当前已登记：

| dataset_id | 当前模型 | 当前 detector | legacy profile | 本地目录 |
|---|---|---|---|---|
| `golden_a_20260522_dev_lab` | `WHOLE_ENVELOPE` | `ContrastWidestSpanDetector` | `A_BALLOON_ENVELOPE + BalloonEnvelopeDetector` | `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab` |
| `golden_c_20260529_dev_lab` | `WHOLE_ENVELOPE` | `ContrastWidestSpanDetector` | `C_BUNDLE_ENVELOPE + BundleEnvelopeDetector` | `/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab` |

每个目录应包含：

```text
manifest.json
temperature.csv
frames/frame_*.npy
capture.avi  # 如存在，可用于预览或人工核对
```

Codex 进行 Offline playback、Live offline run、A/B detector 验收、真实浏览器复测时，必须优先使用这两组数据。

仓库内两份旧 `measurement_definition.json` 及对应 smoke 数值保留为 2026-06 历史算法兼容基线，不应改写为当前 detector 的结果。当前统一模型必须另行用窄测量带执行 Probe/浏览器回归并保存新证据。
