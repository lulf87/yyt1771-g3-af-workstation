param(
    [string]$Config = "configs\local\realcamera_temp.local.yaml",
    [string]$BackendUrl = "http://127.0.0.1:8022"
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

function Read-YamlListFirst {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key
    )
    $lines = Get-Content -Path $Path
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^\s*$Key\s*:") {
            for ($next = $index + 1; $next -lt $lines.Count; $next++) {
                if ($lines[$next] -match "^\s*-\s*`"?([^`"#]+)`"?") {
                    return $Matches[1].Trim()
                }
                if ($lines[$next] -match "^\S") {
                    break
                }
            }
        }
    }
    return ""
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

Write-Host "Python version:"
python --version
Write-Host "Python architecture:"
python -c "import platform, struct; print(platform.python_implementation(), platform.python_version(), str(struct.calcsize('P') * 8) + '-bit')"

Write-Host "Node version:"
node --version
Write-Host "npm version:"
npm --version

$ConfigPath = Join-Path $Root $Config
Write-Host "Config path: $ConfigPath"
if (-not (Test-Path $ConfigPath)) {
    Write-Warning "Config not found. Copy a configs\hardware\*.windows.example.yaml file into configs\local and edit it."
    exit 0
}

$SdkPythonPath = Read-YamlListFirst -Path $ConfigPath -Key "sdk_python_paths"
$SdkLibraryDir = Read-YamlScalar -Path $ConfigPath -Key "sdk_library_dir"
$SdkLibraryPath = Read-YamlScalar -Path $ConfigPath -Key "sdk_library_path"

Write-Host "sdk_python_paths exist: $(Test-Path $SdkPythonPath)"
Write-Host "MvCameraControl_class.py exists: $(Test-Path (Join-Path $SdkPythonPath 'MvCameraControl_class.py'))"
Write-Host "sdk_library_path exists: $(Test-Path $SdkLibraryPath)"
Write-Host "sdk_library_dir exists: $(Test-Path $SdkLibraryDir)"
Write-Host "MvCameraControl.dll exists: $(Test-Path (Join-Path $SdkLibraryDir 'MvCameraControl.dll'))"

Write-Host "Serial COM ports:"
python -c "from serial.tools import list_ports; [print(p.device + ' ' + (p.description or '')) for p in list_ports.comports()]"

try {
    $Health = Invoke-RestMethod -Uri "$BackendUrl/api/health" -TimeoutSec 2
    Write-Host "Backend health:"
    $Health | ConvertTo-Json -Depth 5
}
catch {
    Write-Warning "Backend health is not available at $BackendUrl."
}

try {
    $SourceStatus = Invoke-RestMethod -Uri "$BackendUrl/api/operator/source-status" -TimeoutSec 2
    Write-Host "operator source-status:"
    $SourceStatus | ConvertTo-Json -Depth 8
}
catch {
    Write-Warning "operator source-status is not available at $BackendUrl."
}
