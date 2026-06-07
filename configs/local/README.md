# configs/local

本目录用于放置开发者本机专用配置，例如真实离线素材的绝对路径。

当前推荐文件：

```text
configs/local/offline_datasets.local.json
configs/local/realcamera_temp.local.yaml
```

该文件记录 G3 的本地 golden/offline datasets：

```text
golden_a_20260522_dev_lab -> A 类球囊 / 网状结构
golden_c_20260529_dev_lab -> C 类多细支 / 多线束整体结构
```

注意：

```text
1. 这里通常包含本机绝对路径，不建议提交到公开仓库。
2. Codex 做 Offline playback、Live offline run、detector regression、真实浏览器复测时，必须优先读取该文件。
3. 如果本机路径变化，只改该 local json，不要在代码中硬编码路径。
```

真实相机和 LU92XX 温控联调时，可从模板复制本机配置：

```bash
cp configs/hardware/realcamera_temp.example.yaml configs/local/realcamera_temp.local.yaml
```

然后在 `configs/local/realcamera_temp.local.yaml` 中填写本机 Hik MVS SDK 路径、相机筛选信息和 LU92XX 串口。源码和前端请求只读取 profile，不写死本机路径。
