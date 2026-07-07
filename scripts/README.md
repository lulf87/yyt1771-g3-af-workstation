# scripts

## 快速启动

下次只需要从仓库根目录运行：

```bash
scripts/g3_fast_start.sh real-real
scripts/g3_fast_start.sh real-simtemp
scripts/g3_fast_start.sh sim-sim
```

模式含义：

```text
real-real     真实 Hik 相机 + 真实 LU92XX 温控
real-simtemp  真实 Hik 相机 + 内置模拟温控
sim-sim       内置模拟相机 + 内置模拟温控
```

脚本会复用已经健康运行且模式一致的 8022 后端和 5176 前端；模式不一致时，只会重启本项目的 uvicorn/Vite 进程，不会误杀无关进程。

## 建议后续加入

```text
run_backend_dev.sh
run_frontend_dev.sh
run_tests.sh
run_e2e.sh
export_run_artifacts.py
validate_manifest.py
```
