# Windows x64 零环境交付与验收

## 交付目标

目标操作系统为 Windows 10/11 x64。最终用户只需运行 `YYT1771-G3-Setup-<version>-x64.exe`，无需安装 Python、Node.js、Git 或 Git Bash。运行时由单一 `G3Workstation.exe` 启动 FastAPI，并由后端同源提供已编译前端。

Windows 正式包固定使用 `production + real_hardware`，只支持真实 Hik 相机与真实 LU92XX 温控。安装包不携带本机 Golden Dataset，不要求 `offline_datasets.local.json`，不向操作员提供离线素材或模拟数据入口，也不得在硬件不可用时回退到模拟源。离线数据能力仅保留在源码开发与自动测试模式中。

## 在 Mac 上的开发边界

Mac 可以完成 Python/TypeScript 测试、`frontend/dist` 构建、路径策略和打包配置审查。PyInstaller 产物和 Inno Setup 安装包必须在 Windows x64 上生成；本仓库通过 `Windows release` GitHub Actions 工作流完成。

## 构建

在 GitHub 的 Actions 页面手工运行 `Windows release`，输入版本号。工作流将运行后端测试、前端测试/构建、PyInstaller one-folder 打包和 Inno Setup 编译，并上传 portable ZIP 与 Setup EXE。

在 Windows 3.11 x64 构建机上也可直接运行：

```powershell
./packaging/windows/build_release.ps1 -Version 0.1.0
```

## 运行时路径

```text
程序：C:\Program Files\YYT1771-G3
配置：C:\ProgramData\YYT1771-G3\config\hardware.yaml
测量运行：C:\ProgramData\YYT1771-G3\data\runs
日志：%LOCALAPPDATA%\YYT1771-G3\logs
```

升级和卸载默认不删除 `ProgramData` 中的设备绑定与历史测量数据。

## 本版设备向导与实时预览行为

- 设备向导点击“完成”时会重新执行一次相机与温控绑定测试；只有测试和配置保存均成功后才关闭向导。
- 配置通过并进入 Operator“实时测试”页后，默认自动打开真实相机实时预览，无需先点击“检测当前帧”。
- 设备设置预览与“检测当前帧”的相机目标帧率固定为 20 FPS。该覆盖同样适用于升级后仍保留旧版 `hardware.yaml`（其中可能写有 10 FPS）的电脑。
- 正式测量 Run 启动前会释放设备设置预览；Run 停止或完成后恢复自动预览。正式测量采集频率继续使用 Run/测量配置，不被设备设置预览的 20 FPS 覆盖。
- 升级继续保留 `C:\ProgramData\YYT1771-G3\config\hardware.yaml` 中的相机、串口绑定以及历史测量数据，不执行破坏性配置迁移。

## 第三方硬件前置

Hik MVS Runtime/GigE 驱动和 USB-RS485/RS232 驱动的再分发需先确认厂商许可。未确认前，不将厂商 DLL 或安装程序纳入 G3 安装包。无 MVS 时应能启动并显示明确的设备环境错误，但生产模式不得回退到模拟硬件。

全新 Windows 11 x64 电脑的边界如下：

| 项目 | 是否需要手工预装 | 说明 |
|---|---:|---|
| Python / FastAPI / NumPy / OpenCV 等 | 否 | 由 PyInstaller 包含 |
| Node.js / npm | 否 | 只在构建机编译前端，目标机使用静态产物 |
| Git / Git Bash | 否 | 运行时不使用 |
| 浏览器 | 否 | Windows 11 自带 Edge，也可使用 Chrome |
| Hikrobot MVS x64 + GigE 驱动 | 是 | 安装标准 MVS；G3 会自动发现标准 Python Binding 和 `Win64_x64` Runtime |
| USB 转串口驱动 | 视转换器芯片 | Windows 未自动识别为 COM 口时，安装对应 VID/PID/芯片的厂商驱动 |
| GigE 网卡 IPv4 | 需配置 | 例如相机为 `192.168.3.211/24`，专用网卡可设为不冲突的 `192.168.3.10/24` |

安装器会显示上述前置状态，但在未确认 Hikrobot 和 USB 转串口厂商的再分发、静默安装条款前，不会擅自携带或静默安装第三方驱动。

## MVS 路径初始化

标准 MVS 安装位置无需手工配置，G3 会自动检测：

```text
C:\Program Files (x86)\MVS\Development\Samples\Python\MvImport\MvCameraControl_class.py
C:\Program Files (x86)\Common Files\MVS\Runtime\Win64_x64\MvCameraControl.dll
```

如果 MVS 安装在非标准目录，在 G3 页面打开“设备设置 → 环境检查”：

1. 点击“使用自动检测路径”将已发现的路径填入表单。
2. 必要时手工填入包含 `MvCameraControl_class.py` 的目录（或该文件本身）。
3. 填入 x64 `MvCameraControl.dll` 文件或其所在目录。
4. 点击“验证并保存路径”。程序会在文件存在性验证通过后写入 `C:\ProgramData\YYT1771-G3\config\hardware.yaml`，且保留已绑定的相机和温控串口。

不使用浏览器文件上传选择 DLL：浏览器会隐藏客户端真实路径，而将厂商 DLL 复制到 G3 数据目录也会带来依赖和授权问题。

## 必须在 Windows 完成的验收

- 全新 Windows 10/11 x64，无 Python/Node/Git，安装与卸载。
- 安装路径、用户名包含空格和中文。
- 双击桌面图标无黑色命令行窗口，页面自动打开，刷新 SPA 路由不返回 404。
- 升级后硬件绑定和历史 run 保留。
- 在旧版本已保存 `target_frame_rate_hz: 10` 的电脑上覆盖安装；确认绑定仍保留，设备向导完成后自动出现实时画面，设备设置预览按 20 FPS 目标运行。
- 在设备向导中完成相机与 LU92XX 测试后点击“完成”；确认 fresh test 和保存成功才关闭，再次打开向导时仍显示原绑定。
- 关闭向导进入 Operator“实时测试”页，不点击“检测当前帧”，确认自动持续显示真实相机画面。
- 点击“检测当前帧”确认单帧检测可用；启动 Run 时确认预览释放并由 Run 接管相机，停止后确认自动预览恢复。
- 安装 Hik MVS x64 后完成相机枚举、预览、抓帧和断线恢复。
- 连接 LU92XX 后完成 COM 口枚举、温度读取、测量与异常拔出处理。
- 使用真实硬件运行 Setup / Probe / Run / Analysis / Export 整个流程并保存证据。

当前 P-0107 尚未解决：验收实时预览时只保留一个 Operator 页面，避免多个页面同时轮询相机产生间歇性 409。此限制不影响单操作员页面的正式验收，但不能据此宣称多客户端共享预览已完成。2026-10-23 起，“检测当前帧”和曝光写入已改为排队等待相机锁（最多 5 s），不再因为页面轮询在跑而立即返回 409。

## GigE 网卡调优（每台新机必做）

一帧 `3072 × 2048 × 1 B = 6.29 MB`，10 fps 约 500 Mbps。Windows 网卡默认配置撑不住这个流，
典型表现是**画面全黑或残缺，但 API 仍返回 `camera_status=ok`**——2026-10-23 客户机实测每帧丢 3021 个包（约 72%），
而检测在残缺帧上算出了 1904.00 px 的错误距离。

前置条件：相机直连这张专用网卡；若必须经过交换机，交换机需支持 9K 巨帧。

```powershell
$n = "Ethernet"   # 先用 Get-NetAdapter 确认真实名称
Get-NetAdapter -Name $n | Select-Object Name, InterfaceDescription, Status, LinkSpeed   # 必须是 1 Gbps

Set-NetAdapterAdvancedProperty -Name $n -RegistryKeyword "*JumboPacket"         -RegistryValue "9014"
Set-NetAdapterAdvancedProperty -Name $n -RegistryKeyword "*EEE"                 -RegistryValue "0"
Set-NetAdapterAdvancedProperty -Name $n -RegistryKeyword "EnableGreenEthernet"  -RegistryValue "0"
Set-NetAdapterAdvancedProperty -Name $n -RegistryKeyword "GigaLite"             -RegistryValue "0"
Set-NetAdapterAdvancedProperty -Name $n -RegistryKeyword "PowerSavingMode"      -RegistryValue "0"
Set-NetAdapterAdvancedProperty -Name $n -RegistryKeyword "*InterruptModeration" -RegistryValue "0"

Get-NetAdapterAdvancedProperty -Name $n |
  Where-Object RegistryKeyword -in "*JumboPacket", "*ReceiveBuffers", "*EEE" |
  Select-Object DisplayName, DisplayValue

Restart-NetAdapter -Name $n   # 链路会短暂断开，随后恢复
```

说明：

- `*ReceiveBuffers` 在 Realtek 驱动上的合法范围只有 32–512，默认已是 512，**无法再提高**；靠巨帧把包速率从约 42k/s 降到约 7k/s 来补偿。
- 巨帧生效后 Windows IP MTU 自动变为 9000；`netsh interface ipv4 set subinterface ... mtu=9014` 会报“参数不正确”，属正常现象。
- 若交换机不支持巨帧，必须把 `*JumboPacket` 回退为 `1514`，并接受更高的丢包风险。
- 多台同类机器建议直接使用 Intel I210/I350 网卡，避免在 Realtek 的 512 缓冲上反复调参。

## 相机链路验收（设备级指标，不看画面亮度）

现场验收相机只看连通与通讯时，用这条命令，不依赖画面亮度：

```powershell
$r = Invoke-RestMethod "http://127.0.0.1:8022/api/camera/preview" -TimeoutSec 30
$lost = if ($null -eq $r.camera_meta.camera_lost_packet_count) { 0 } else { $r.camera_meta.camera_lost_packet_count }
"status={0}  {1}x{2}  fps={3}  lost={4}  frame={5}" -f $r.camera_status, $r.shape[1], $r.shape[0],
  [math]::Round($r.camera_meta.camera_resulting_fps, 1), $lost, $r.camera_meta.camera_frame_id
```

通过标准：

- `status=ok`；
- `lost=0`（`camera_lost_packet_count` 字段缺失即表示 0）；
- `fps` 与配置一致（默认约 10）；
- 连续两次调用，`frame` 有增长。

失败对照：

| 现象 | 含义 | 处理 |
|---|---|---|
| `lost` 每帧上千 | 网卡/链路丢包 | 执行上面的网卡调优；确认直连、1 Gbps、巨帧已开 |
| `lost` 数百 | 有改善但未达标 | 确认是否经过交换机、是否与办公网共用同一网口 |
| `Failed to read frame ... ret=0x80000007` | 取帧超时（MV_E_NODATA） | 曝光不能接近取帧超时；约束 `exposure_us × target_frame_rate_hz ≤ 1e6`，且主帧耗时 < `timeout_ms` |
| `Failed to open device` | 设备被独占或 IP 冲突 | 关闭 MVS 客户端后重启 G3；用 MVS 确认相机 IP 无冲突 |
| `camera_resulting_fps` 远低于预期 | 曝光压住了帧率 | 降低曝光或降低 `target_frame_rate_hz` |

丢包帧不会进入正式结果：每帧丢包超过 8 个时，探测与实时测试都会把该帧判为 `INVALID_FRAME_DATA_LOSS`，不输出 A/B 与 `distance_px`，曲线点同步排除。
