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
- 安装 Hik MVS x64 后完成相机枚举、预览、抓帧和断线恢复。
- 连接 LU92XX 后完成 COM 口枚举、温度读取、测量与异常拔出处理。
- 使用真实硬件运行 Setup / Probe / Run / Analysis / Export 整个流程并保存证据。
