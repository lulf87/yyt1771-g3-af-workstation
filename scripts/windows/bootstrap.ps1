param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name was not found. $InstallHint"
    }
    return $command.Source
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

Write-Host "Checking Python..."
$PythonCommand = Require-Command -Name "python" -InstallHint "Install Python 3.11 x64 and enable Add python.exe to PATH."
$PythonVersion = & $PythonCommand --version
Write-Host "  $PythonVersion"
if ($PythonVersion -notmatch "Python 3\.11") {
    Write-Warning "Python 3.11 x64 is recommended. Current: $PythonVersion"
}

Write-Host "Checking Node..."
$NodeCommand = Require-Command -Name "node" -InstallHint "Install Node.js LTS x64."
$NpmCommand = Require-Command -Name "npm" -InstallHint "Install Node.js LTS x64, which includes npm."
Write-Host "  node $(& $NodeCommand --version)"
Write-Host "  npm $(& $NpmCommand --version)"

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating .venv..."
    & $PythonCommand -m venv .venv
}

Write-Host "Installing backend requirements..."
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r backend\requirements.txt

Write-Host "Installing frontend dependencies..."
Push-Location (Join-Path $Root "frontend")
try {
    npm install
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "For real hardware, copy configs\hardware\realcamera_temp.windows.example.yaml to configs\local\realcamera_temp.local.yaml and edit SDK/COM/camera fields."
Write-Host "For offline/simulated mode, copy configs\hardware\simulated.windows.example.yaml to configs\local\simulated.local.yaml and edit configs\local\offline_datasets.local.json."
