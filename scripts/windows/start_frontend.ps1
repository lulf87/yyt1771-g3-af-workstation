param(
    [string]$ApiBase = "http://127.0.0.1:8022",
    [int]$Port = 5176,
    [string]$HostName = "127.0.0.1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Frontend = Join-Path $Root "frontend"
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    throw "frontend\node_modules was not found. Run .\scripts\windows\bootstrap.ps1 first."
}

$env:VITE_G3_API_BASE = $ApiBase
Set-Location $Frontend

Write-Host "Starting frontend at http://$HostName`:$Port"
Write-Host "VITE_G3_API_BASE=$ApiBase"
npm run dev -- --host $HostName --port $Port
