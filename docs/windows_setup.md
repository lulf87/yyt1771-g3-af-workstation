# G3 Windows source-development helper

The zero-environment Windows delivery is `YYT1771-G3-Setup-<version>-x64.exe` / `G3Workstation.exe`; it does not use this script and does not require Python, Node.js, Git, or Git Bash on the target workstation. See `docs/windows/Windows_零环境交付与验收.md`.

`scripts/windows/start_operator.ps1` is only a source-tree development helper. It defaults to the actual-use Operator UI, real hardware, and production product mode:

```powershell
$env:YYT1771_G3_PRODUCT_MODE = "production"
scripts\windows\start_operator.ps1 -Source real
```

For an explicitly requested development demonstration:

```powershell
$env:YYT1771_G3_PRODUCT_MODE = "development"
$env:YYT1771_G3_SIMULATED_DATASET_ID = "golden_a_20260522_dev_lab"
scripts\windows\start_operator.ps1 -Source sim
```

`-Source` overrides an inherited `YYT1771_G3_RUNTIME_SOURCE`. This source-development helper expects Git for Windows Bash because it delegates common process reuse, health checks, and browser opening to `scripts/g3_fast_start.sh`; that requirement does not apply to the packaged workstation.

Real mode uses `configs/local/realcamera_temp.local.yaml`. Sim mode uses `configs/local/simcamera_simtemp.local.yaml`. Production mode rejects sim startup, and real mode never falls back to simulated camera or temperature backends.
