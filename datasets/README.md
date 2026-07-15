# datasets

本目录用于本地开发和 golden regression 数据。

```text
datasets/golden/  可提交小型 golden dataset 或元数据。
datasets/local/   本地真实大数据，不建议提交。
```

真实大型 frames 建议不要直接提交到 Git。可以只提交 manifest 样例、measurement_definition 和 expected summary。

---

## 本地真实离线素材

当前 G3 已确认两组真实离线素材，路径登记在：

```text
configs/local/offline_datasets.local.json
```

不要在代码中硬编码绝对路径。后端、前端和测试都应通过 dataset id 调用：

```text
golden_a_20260522_dev_lab  整体外包络回归素材（a 为历史 ID）
golden_c_20260529_dev_lab  整体外包络回归素材（c 为历史 ID）
```

新建测量统一使用 `WHOLE_ENVELOPE + ContrastWidestSpanDetector + max_width` 和默认 8 px 非零窄测量带。仓库内旧 measurement_definition 与 expected output 是历史 detector 回归基线，不是当前产品分类。

本机素材根目录：

```text
/Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures
```

详细说明见：

```text
docs/data/G3_离线素材注册表_v0.1.md
```
