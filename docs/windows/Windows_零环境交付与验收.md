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

## 必须在 Windows 完成的验收

- 全新 Windows 10/11 x64，无 Python/Node/Git，安装与卸载。
- 安装路径、用户名包含空格和中文。
- 双击桌面图标无黑色命令行窗口，页面自动打开，刷新 SPA 路由不返回 404。
- 升级后硬件绑定和历史 run 保留。
- 安装 Hik MVS x64 后完成相机枚举、预览、抓帧和断线恢复。
- 连接 LU92XX 后完成 COM 口枚举、温度读取、测量与异常拔出处理。
- 使用真实硬件运行 Setup / Probe / Run / Analysis / Export 整个流程并保存证据。
