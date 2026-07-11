param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("real", "sim")]
    [string]$Source,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ($Source -eq "real") {
    $env:YYT1771_G3_RUNTIME_SOURCE = "real_hardware"
    if (-not $env:YYT1771_G3_HARDWARE_CONFIG) {
        $env:YYT1771_G3_HARDWARE_CONFIG = Join-Path $RootDir "configs\local\realcamera_temp.local.yaml"
    }
    $FastStartMode = "real-real"
} else {
    $env:YYT1771_G3_RUNTIME_SOURCE = "simulated_material"
    if (-not $env:YYT1771_G3_SIMULATED_DATASET_ID) {
        $env:YYT1771_G3_SIMULATED_DATASET_ID = "golden_a_20260522_dev_lab"
    }
    if (-not $env:YYT1771_G3_HARDWARE_CONFIG) {
        $env:YYT1771_G3_HARDWARE_CONFIG = Join-Path $RootDir "configs\local\simcamera_simtemp.local.yaml"
    }
    $FastStartMode = "sim-sim"
}

$ProductMode = if ($env:YYT1771_G3_PRODUCT_MODE) { $env:YYT1771_G3_PRODUCT_MODE } else { "development" }
Write-Host "Runtime source: $env:YYT1771_G3_RUNTIME_SOURCE"
Write-Host "Product mode: $ProductMode"
Write-Host "Hardware config: $env:YYT1771_G3_HARDWARE_CONFIG"
Write-Host "Fast-start mode: $FastStartMode"
if ($Source -eq "sim") {
    Write-Host "Simulated dataset: $env:YYT1771_G3_SIMULATED_DATASET_ID"
}

if ($DryRun) { exit 0 }

& bash (Join-Path $RootDir "scripts\g3_fast_start.sh") $FastStartMode
exit $LASTEXITCODE
