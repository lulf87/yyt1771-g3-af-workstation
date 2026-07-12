# G3 Windows Operator Delivery

Windows third-party delivery defaults to the actual-use Operator UI, real hardware, and production product mode. The browser does not expose Engineering mode or a simulated-material selector.

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

`-Source` overrides an inherited `YYT1771_G3_RUNTIME_SOURCE`. The wrapper expects Git for Windows Bash because it delegates common process reuse, health checks, and browser opening to `scripts/g3_fast_start.sh`.

Real mode uses `configs/local/realcamera_temp.local.yaml`. Sim mode uses `configs/local/simcamera_simtemp.local.yaml`. Production mode rejects sim startup, and real mode never falls back to simulated camera or temperature backends.
