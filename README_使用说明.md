# G3 Codex Starter Pack 使用说明

这个包用于启动 **YY/T 1771 AF Web Station G3** 的新仓库开发。它包含 Codex 需要遵守的 `AGENTS.md`、问题追踪模板 `problem.md`、需求/架构/算法/测试过程文档、离线素材配置，以及推荐目录骨架。

---

## 1. 推荐使用方式

将本包解压后，把内容放到新仓库根目录，例如：

```bash
unzip g3_codex_starter_pack_with_offline_datasets.zip -d g3-yyt1771-af-station
cd g3-yyt1771-af-station/g3_codex_starter_pack
```

如果你已经有新仓库，也可以把包内文件复制到仓库根目录：

```bash
cp -R g3_codex_starter_pack/* <your-repo>/
```

仓库根目录应该包含：

```text
AGENTS.md
problem.md
README_使用说明.md
.codex/
docs/
backend/
frontend/
configs/
datasets/
scripts/
```

---

## 2. 本地离线素材配置

你提供的两组真实离线素材已经登记在：

```text
configs/local/offline_datasets.local.json
```

对应关系：

```text
golden_a_20260522_dev_lab -> /Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260522-183158-dev_lab -> A 类 -> BalloonEnvelopeDetector -> max_width
golden_c_20260529_dev_lab -> /Users/lulingfeng/Documents/工作/开发/奥氏体变换/1771/yyt1771_starter/examples/runtime/camera_captures/20260529-194304-dev_lab -> C 类 -> BundleEnvelopeDetector -> max_width
```

Codex 后续做 Offline playback、Live offline run、A/C detector、temperature-distance 曲线、Export 和真实浏览器复测时，应通过 dataset id 调用上述素材。

不要把绝对路径写死在代码里；如果路径变化，只修改：

```text
configs/local/offline_datasets.local.json
```

详细说明见：

```text
docs/data/G3_离线素材注册表_v0.1.md
```

---

## 3. 启动项目

本项目需要同时启动 backend 和 frontend。建议使用两个终端窗口分别运行。

### 3.1 准备 Python 环境

在仓库根目录执行：

```bash
cd /Users/lulingfeng/Documents/工作/开发/奥氏体2025.6.3
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

如果这些 Python 依赖已经安装过，可以跳过安装步骤，只需要激活对应环境。

### 3.1.1 OpenCV / NumPy 兼容性检查

归档脚本依赖 OpenCV。建议所有项目命令和归档脚本 smoke 都优先使用本项目 `.venv`，不要直接混用 Homebrew Python、系统 Python 和 Miniforge base：

```bash
cd /Users/lulingfeng/Documents/工作/开发/奥氏体2025.6.3
source .venv/bin/activate
python - <<'PY'
import sys
import numpy as np
import cv2
print("python", sys.executable)
print("numpy", np.__version__, np.__file__)
print("cv2", cv2.__version__, cv2.__file__)
PY
```

如果必须用当前 shell 的 `python3` 直接运行 `/Users/lulingfeng/Documents/工作/开发/归档` 中的脚本，也要先确认它的 OpenCV wheel 与 NumPy 兼容：

```bash
python3 - <<'PY'
import sys
import numpy as np
import cv2
print("python", sys.executable)
print("numpy", np.__version__, np.__file__)
print("cv2", cv2.__version__, cv2.__file__)
PY
```

若出现 `numpy.core.multiarray failed to import`、`_ARRAY_API not found` 或类似 ABI 错误，通常是同一个 Python 环境里的 OpenCV wheel 太旧或多个 OpenCV wheel 版本不一致。当前已验证可用的修复方式是把同一环境中的 OpenCV wheel 统一到 `4.13.0.92`：

```bash
python3 -m pip install --upgrade opencv-python opencv-python-headless opencv-contrib-python
python3 -m pip check
```

说明：`pip check` 可能报告该 base 环境里其他历史包的冲突；只要上面的 `import cv2` 检查通过，归档 OpenCV 导入问题就已经解决。G3 项目本身仍建议使用 `.venv`，因为 `.venv/bin/python -m pip check` 当前应为干净状态。

### 3.2 启动 backend

推荐固定使用 `8022` 端口：

#### 3.2.1 真机 / 真实相机推荐启动方式

如果要使用真实 Hik 相机或真实温控，后端固定使用已经验证过的 x86_64 Conda 环境：

```bash
cd /Users/lulingfeng/Documents/工作/开发/奥氏体2025.6.3
PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m uvicorn yyt1771_g3.api.main:app --host 127.0.0.1 --port 8022
```

说明：

```text
1. 真实 Hik MVS 链路需要使用 yyt1771-mvs-x86 环境。
2. 不要优先使用 .venv + --reload 启动真机后端；该环境可能与 Hik MVS runtime 或 Python 包读取状态冲突。
3. Codex 后续收到“帮我启动 / 启动真机 / 真实相机启动”时，应直接使用本小节命令。
```

#### 3.2.2 普通开发 / 离线模式启动方式

普通离线开发可使用 `.venv`：

```bash
cd /Users/lulingfeng/Documents/工作/开发/奥氏体2025.6.3
source .venv/bin/activate
PYTHONPATH=backend/src python3 -m uvicorn yyt1771_g3.api.main:app --host 127.0.0.1 --port 8022 --reload
```

启动后可检查：

```text
http://127.0.0.1:8022/docs
http://127.0.0.1:8022/api/offline-datasets
```

如果 `configs/local/offline_datasets.local.json` 中的素材路径有效，`/api/offline-datasets` 应能列出：

```text
golden_a_20260522_dev_lab
golden_c_20260529_dev_lab
```

### 3.3 启动 frontend

另开一个终端，在仓库根目录执行：

```bash
cd /Users/lulingfeng/Documents/工作/开发/奥氏体2025.6.3/frontend
npm install
VITE_G3_API_BASE=http://127.0.0.1:8022 npm run dev -- --port 5176
```

然后打开：

```text
http://127.0.0.1:5176
```

说明：

```text
1. frontend 默认 API 地址是 http://127.0.0.1:8000。
2. 如果 backend 按上面的 8022 端口启动，必须设置 VITE_G3_API_BASE=http://127.0.0.1:8022。
3. 如果 5176 被占用，可以改成其他端口，例如 --port 5177。
```

### 3.4 启动前后检查

启动前先检查端口是否已有服务：

```bash
lsof -nP -iTCP:8022 -sTCP:LISTEN || true
lsof -nP -iTCP:5176 -sTCP:LISTEN || true
```

如果端口已被本项目服务占用且健康检查通过，可以直接复用。启动后建议检查：

```bash
curl -sS http://127.0.0.1:8022/api/health
curl -sS http://127.0.0.1:8022/api/offline-datasets
curl -I -sS http://127.0.0.1:5176/
```

确认后打开：

```bash
open http://127.0.0.1:5176/
```

### 3.5 常用检查命令

```bash
# backend 测试
cd /Users/lulingfeng/Documents/工作/开发/奥氏体2025.6.3
PYTHONPATH=backend/src python3 -m pytest backend/tests tests -q

# frontend 测试和构建
cd /Users/lulingfeng/Documents/工作/开发/奥氏体2025.6.3/frontend
npm test
npm run build
```

---

## 4. 给 Codex 的第一条建议指令

在 Codex 中开始开发时，可以这样说：

```text
请先阅读 AGENTS.md、problem.md、docs/requirements/G3_需求规格说明书_v0.1.md、docs/milestones/G3_开发任务拆分_v0.1.md、docs/data/G3_离线素材注册表_v0.1.md，并检查 configs/local/offline_datasets.local.json。然后按照 Milestone 0/1 建立项目骨架和 offline dataset loader。过程中发现问题必须登记到 problem.md；如果修复问题，必须真实浏览器复测后才能标注完成。
```

---

## 5. AGENTS.md 的作用

`AGENTS.md` 是 Codex 的项目行为规范，重点包括：

```text
1. 必须遵守 G3 已确认需求。
2. 必须维护 problem.md。
3. 发现问题必须登记。
4. 修复后必须先标记 FIXED_PENDING_BROWSER_RETEST。
5. 必须真实浏览器复测通过后，才能标记 RESOLVED_BROWSER_VERIFIED。
6. 前端不得计算正式 A/B 和 distance。
7. 相机 SDK 必须 lazy import。
8. 无相机时系统也要能运行 offline/playback/re-analysis。
9. 离线素材必须通过 dataset id 和 configs/local/offline_datasets.local.json 调用。
```

---

## 6. problem.md 的作用

`problem.md` 是问题登记文件。

开发过程中如果遇到：

```text
A/B 点跳动
外包络识别错误
ROI 坐标错乱
温度同步异常
离线素材路径不可访问
导出和 UI 不一致
真实浏览器复测失败
硬件阻塞
需求不清楚
```

必须登记到 `problem.md`。

问题解决后必须：

```text
1. 填写 Fix summary。
2. 状态改为 FIXED_PENDING_BROWSER_RETEST。
3. 做真实浏览器复测。
4. 复测通过后改为 RESOLVED_BROWSER_VERIFIED。
5. 写明浏览器、数据集、页面、步骤、结果和证据。
```

---

## 7. 推荐开发顺序

按照 `docs/milestones/G3_开发任务拆分_v0.1.md` 推进：

```text
Milestone 0：Golden Dataset 和验收基准
Milestone 1：新仓库骨架
Milestone 2：核心数据模型
Milestone 3：Offline Playback + ROI
Milestone 4：A/C Detector 原型
Milestone 5：A/B 稳定策略
Milestone 6：温度同步和曲线
Milestone 7：Live Offline Run
Milestone 8：Real Camera Preview / Run
Milestone 9：Export
```

建议不要一开始就接真实相机。先用 Offline playback 和 Live offline run 稳定算法。

---

## 8. 真实浏览器复测要求

AGENTS.md 已经强制规定：凡是修复涉及 UI、ROI、A/B overlay、Playback、Run、Analysis、Export、temperature-distance 曲线的问题，都必须真实浏览器复测。

推荐方式：

```text
1. 手动打开 Chrome/Edge/Safari 测。
2. 或使用 Playwright/Selenium 驱动浏览器测。
```

不算真实浏览器复测的方式：

```text
pytest
vitest
HTTP API 测试
TypeScript 编译通过
只看函数返回值
```

如果当前环境无法真实浏览器复测，问题不能标记为已解决，只能保持：

```text
FIXED_PENDING_BROWSER_RETEST
```

---

## 9. 本包包含的主要文件

```text
AGENTS.md
problem.md
README_使用说明.md
.codex/00_CODEX_START_HERE.md
.codex/CODEX_TASK_TEMPLATE.md
.codex/REAL_BROWSER_RETEST_CHECKLIST.md
configs/local/offline_datasets.local.json
configs/examples/offline_datasets.local.example.json
docs/requirements/G3_需求规格说明书_v0.1.md
docs/milestones/G3_开发任务拆分_v0.1.md
docs/architecture/G3_技术架构草案_v0.1.md
docs/algorithms/G3_AB检测与外包络算法需求_v0.1.md
docs/data/G3_数据结构与manifest草案_v0.1.md
docs/data/G3_离线素材注册表_v0.1.md
docs/testing/G3_验收与真实浏览器复测清单_v0.1.md
docs/testing/G3_golden_dataset_plan_v0.1.md
docs/dev/PROJECT_STRUCTURE.md
```
