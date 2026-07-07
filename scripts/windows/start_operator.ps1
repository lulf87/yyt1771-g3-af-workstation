param(
    [string]$Config = "configs\local\realcamera_temp.local.yaml",
    [int]$BackendPort = 8022,
    [int]$FrontendPort = 5176
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    throw ".venv was not found. Run .\scripts\windows\bootstrap.ps1 first."
}
if (-not (Test-Path $Config)) {
    throw "Config file was not found: $Config. Copy configs\hardware\realcamera_temp.windows.example.yaml to configs\local\realcamera_temp.local.yaml and edit it."
}

$BackendScript = Join-Path $Root "scripts\windows\start_backend.ps1"
$FrontendScript = Join-Path $Root "scripts\windows\start_frontend.ps1"
$ApiBase = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://127.0.0.1:$FrontendPort/?mode=operator"

Write-Host "Launching backend PowerShell window..."
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$BackendScript`"",
    "-Config", "`"$Config`"",
    "-Port", "$BackendPort"
)

Start-Sleep -Seconds 2

Write-Host "Launching frontend PowerShell window..."
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$FrontendScript`"",
    "-ApiBase", "`"$ApiBase`"",
    "-Port", "$FrontendPort"
)

Start-Sleep -Seconds 2
Write-Host "Opening $FrontendUrl"
Start-Process $FrontendUrl
