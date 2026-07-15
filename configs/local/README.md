# configs/local

本目录用于放置开发者本机专用配置，例如真实离线素材的绝对路径。

当前推荐文件：

```text
configs/local/offline_datasets.local.json
configs/local/realcamera_temp.local.yaml
configs/local/realcamera_simtemp.local.yaml
configs/local/simcamera_simtemp.local.yaml
```

该文件记录 G3 的本地 golden/offline datasets：

```text
golden_a_20260522_dev_lab -> 整体外包络回归素材（a 为历史 ID）
golden_c_20260529_dev_lab -> 整体外包络回归素材（c 为历史 ID）
```

两组素材的新建测量默认值均为 `WHOLE_ENVELOPE + ContrastWidestSpanDetector + max_width`，ROI 为默认 8 px 的非零窄测量带。旧 A/C object class 与 Balloon/Bundle detector 只保存在 `legacy_profile` 中用于历史兼容。

注意：

```text
1. 这里通常包含本机绝对路径，不建议提交到公开仓库。
2. Codex 做 Offline playback、Live offline run、detector regression、真实浏览器复测时，必须优先读取该文件。
3. 如果本机路径变化，只改该 local json，不要在代码中硬编码路径。
```

真实相机和 LU92XX 温控联调时，优先在前端“设备设置 / 首次安装向导”中扫描相机、选择温控串口、测试并保存绑定。生产首次安装流程见 `docs/production_setup.md`。

向导默认写入本机 profile：

```text
configs/local/realcamera_temp.local.yaml
```

相机按 `serial_number` 绑定，IP 仅作为连接信息一并保存。更换相机后需要重新绑定；更换 USB 口导致温控串口变化后，需要重新选择串口并保存。不要手动修改 `configs/hardware/*.example.yaml`，也不要把 `configs/local/*.yaml` 提交到 Git。

如需手工准备初始文件，可从模板复制本机配置：

```bash
cp configs/hardware/realcamera_temp.example.yaml configs/local/realcamera_temp.local.yaml
```

然后在 `configs/local/realcamera_temp.local.yaml` 中填写或通过向导保存本机 Hik MVS SDK 路径、相机筛选信息和 LU92XX 串口。SDK 路径候选值和首次安装排查步骤见 `docs/production_setup.md`。源码和前端请求只读取 profile，不写死本机路径。

快速启动三种硬件组合：

```bash
scripts/g3_fast_start.sh real-real     # 真实相机 + 真实温控
scripts/g3_fast_start.sh real-simtemp  # 真实相机 + 内置模拟温控
scripts/g3_fast_start.sh sim-sim       # 内置模拟相机 + 内置模拟温控
```
