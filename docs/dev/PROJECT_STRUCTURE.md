# PROJECT_STRUCTURE.md

G3 推荐目录结构如下。

```text
g3-yyt1771-af-station/
  AGENTS.md
  problem.md
  README_使用说明.md
  .codex/
    00_CODEX_START_HERE.md
    CODEX_TASK_TEMPLATE.md
    REAL_BROWSER_RETEST_CHECKLIST.md
  backend/
    src/yyt1771_g3/
      api/
      core/
      vision/
      services/
      storage/
      camera/
      temperature/
      report/
    tests/
      unit/
      integration/
  frontend/
    src/
      pages/
      components/
      api/
      geometry/
      run/
      playback/
      analysis/
    tests/
      e2e/
  docs/
    requirements/
    milestones/
    architecture/
    algorithms/
    data/
    testing/
    dev/
    assets/diagrams/
  configs/
    detectors/
    camera/
    temperature/
    examples/
  datasets/
    golden/
    local/
  scripts/
```

---

## backend/src/yyt1771_g3/api

FastAPI routes。API 层必须保持薄，只负责请求/响应，不写复杂业务逻辑。

## backend/src/yyt1771_g3/core

核心模型、枚举、ROI、坐标系统、配置。

## backend/src/yyt1771_g3/vision

纯视觉算法，包括 detector、外包络、候选点、稳定策略、overlay 生成。

## backend/src/yyt1771_g3/services

业务流程，包括 setup、playback、live offline run、real camera run、analysis、export。

## backend/src/yyt1771_g3/storage

run、artifact、manifest、frame 数据读写。

## backend/src/yyt1771_g3/camera

相机 adapter。Hik MVS SDK 必须 lazy import。

## backend/src/yyt1771_g3/temperature

温控设备、温度同步、插值、状态判断。

## backend/src/yyt1771_g3/report

CSV / JSON / PNG 导出。

## frontend/src/pages

Setup、Run、Playback、Analysis / Export 页面。

## frontend/src/components

FrameCanvas、ROI editor、overlay、参数面板、曲线组件。

## frontend/src/geometry

前端显示坐标与 measurement coordinates 的映射。

## docs

需求、架构、算法、数据、测试和开发过程文档。

## datasets

`datasets/golden` 用于回归验收；`datasets/local` 用于本地开发，不应提交真实大数据。

## Local Offline Dataset Registry

```text
configs/local/offline_datasets.local.json
```

该文件记录真实离线素材的本机绝对路径。业务代码不得硬编码这些路径，应通过 dataset registry / config loader 读取。

```text
configs/examples/offline_datasets.local.example.json
```

该文件是可提交的模板。换机器开发时复制模板到 `configs/local/offline_datasets.local.json` 并修改 path。

