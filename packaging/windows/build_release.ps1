param(
    [string]$Version = "0.1.0",
    [switch]$SkipTests,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$BuildRoot = Join-Path $Repo "build\windows"
$Venv = Join-Path $BuildRoot ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Dist = Join-Path $BuildRoot "dist"
$Work = Join-Path $BuildRoot "pyinstaller"

function Assert-NativeSuccess([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

New-Item -ItemType Directory -Force -Path $BuildRoot | Out-Null
if (-not (Test-Path $Python)) {
    py -3.11 -m venv $Venv
    Assert-NativeSuccess "Python virtual environment creation"
}
& $Python -m pip install --upgrade pip
Assert-NativeSuccess "pip upgrade"
& $Python -m pip install -r (Join-Path $Repo "backend\requirements-build.txt")
Assert-NativeSuccess "build dependency installation"

Push-Location (Join-Path $Repo "frontend")
try {
    npm ci
    Assert-NativeSuccess "frontend npm ci"
    if (-not $SkipTests) {
        npm test
        Assert-NativeSuccess "frontend tests"
    }
    npm run build
    Assert-NativeSuccess "frontend production build"
} finally {
    Pop-Location
}

if (-not $SkipTests) {
    $env:PYTHONPATH = Join-Path $Repo "backend\src"
    & $Python -m pytest (Join-Path $Repo "backend\tests") -q
    Assert-NativeSuccess "backend tests"
}

Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Dist, $Work
& $Python -m PyInstaller --noconfirm --clean `
    --distpath $Dist --workpath $Work `
    (Join-Path $Repo "packaging\windows\g3_workstation.spec")
Assert-NativeSuccess "PyInstaller build"

$PortableDir = Join-Path $Dist "YYT1771-G3"
$Executable = Join-Path $PortableDir "G3Workstation.exe"
$SmokePort = 18022
$SmokeProcess = Start-Process -FilePath $Executable `
    -ArgumentList @("--source", "real", "--product-mode", "production", "--port", "$SmokePort", "--no-browser") `
    -PassThru
$SmokeHealthy = $false
$SmokeOfflineDatasetsDisabled = $false
$SmokeCameraTargetConfigured = $false
try {
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        if ($SmokeProcess.HasExited) { break }
        try {
            $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/api/health" -TimeoutSec 1
            if ($Health.status -eq "ok") {
                $SmokeHealthy = $true
                $OfflineDatasets = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/api/offline-datasets" -TimeoutSec 2
                $SmokeOfflineDatasetsDisabled = @($OfflineDatasets.datasets).Count -eq 0
                $HardwareProfile = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/api/hardware/profile" -TimeoutSec 2
                $SmokeCameraTargetConfigured = [double]$HardwareProfile.camera.target_frame_rate_hz -eq 20.0
                break
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
} finally {
    if (-not $SmokeProcess.HasExited) { Stop-Process -Id $SmokeProcess.Id -Force }
    $SmokeProcess.WaitForExit()
}
if (-not $SmokeHealthy) {
    throw "Packaged G3Workstation.exe failed the /api/health startup smoke test"
}
if (-not $SmokeOfflineDatasetsDisabled) {
    throw "Packaged G3Workstation.exe exposed offline datasets in production real-hardware mode"
}
if (-not $SmokeCameraTargetConfigured) {
    throw "Packaged G3Workstation.exe did not expose the 20 FPS camera target"
}

$PortableZip = Join-Path $BuildRoot "YYT1771-G3-$Version-portable-x64.zip"
Remove-Item -Force -ErrorAction SilentlyContinue $PortableZip
Compress-Archive -Path (Join-Path $PortableDir "*") -DestinationPath $PortableZip
Get-FileHash -Algorithm SHA256 $PortableZip | Format-List

if (-not $SkipInstaller) {
    $Iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    if (-not (Test-Path $Iscc)) { throw "Inno Setup 6 not found: $Iscc" }
    & $Iscc "/DMyAppVersion=$Version" "/DSourceDir=$PortableDir" `
        "/DOutputDir=$BuildRoot" (Join-Path $Repo "packaging\windows\installer.iss")
    Assert-NativeSuccess "Inno Setup build"
    $Setup = Join-Path $BuildRoot "YYT1771-G3-Setup-$Version-x64.exe"
    Get-FileHash -Algorithm SHA256 $Setup | Format-List
}
