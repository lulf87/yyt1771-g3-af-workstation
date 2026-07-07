param(
    [string]$Config = "configs\local\realcamera_temp.local.yaml",
    [int]$Port = 8022,
    [string]$HostName = "127.0.0.1",
    [switch]$Reload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-YamlScalar {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key
    )
    $match = Select-String -Path $Path -Pattern "^\s*$Key\s*:\s*`"?([^`"#]+)`"?" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $match) {
        return ""
    }
    return $match.Matches[0].Groups[1].Value.Trim()
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    throw ".venv was not found. Run .\scripts\windows\bootstrap.ps1 first."
}

$ConfigPath = Join-Path $Root $Config
if (-not (Test-Path $ConfigPath)) {
    throw "Config file was not found: $Config. Copy configs\hardware\realcamera_temp.windows.example.yaml to configs\local\realcamera_temp.local.yaml and edit it."
}

$SdkLibraryDir = Read-YamlScalar -Path $ConfigPath -Key "sdk_library_dir"
if ($SdkLibraryDir) {
    $env:HIK_MVS_LIBRARY_DIR = $SdkLibraryDir
    if ($env:PATH -notlike "*$SdkLibraryDir*") {
        $env:PATH = "$SdkLibraryDir;$env:PATH"
    }
    Write-Host "Using HIK_MVS_LIBRARY_DIR=$SdkLibraryDir"
}

$env:PYTHONPATH = "backend\src"
$env:YYT1771_G3_HARDWARE_CONFIG = $ConfigPath

$Arguments = @("-m", "uvicorn", "yyt1771_g3.api.main:app", "--host", $HostName, "--port", "$Port")
if ($Reload) {
    $Arguments += "--reload"
}

Write-Host "Starting backend at http://$HostName`:$Port"
Write-Host "Config: $ConfigPath"
& $VenvPython @Arguments
