# Windows Native Setup

This guide explains how to run G3 natively on Windows for Operator Mode, either with offline/simulated data or with a real Hikrobot camera and LU92XX temperature controller.

Windows native support is implemented with mocked/platform tests and documentation. Real hardware validation on an actual Windows machine with Hik MVS SDK, camera, and temperature controller is still required.

TODO(windows-hardware-validation): validate on Windows 10/11 with Hik MVS SDK, MV-CA060-11GM camera, and LU92XX temperature controller.

## Prerequisites

Install these on Windows 10/11 64-bit:

- Windows 10/11 64-bit
- Python 3.11 x64
- Node.js LTS x64
- Git for Windows
- Hikrobot MVS Windows software / SDK
- USB-to-serial driver for the temperature controller
- Chrome or Edge

It is not recommended to run real hardware through WSL. The Hikrobot MVS Windows driver, GigE NIC configuration, USB devices, and COM serial ports are more reliable from native Windows.

Offline/simulated mode can run without the MVS SDK. Real hardware mode requires the MVS SDK, and MVS Viewer must see the camera before G3 is expected to work.

## Prepare Hardware

1. Install Hikrobot MVS for Windows.
2. Open MVS Viewer and confirm the camera is visible.
3. Configure the GigE NIC IP and the camera IP in the same subnet.
4. Record the camera model, serial number, and IP from MVS Viewer.
5. Connect the LU92XX controller and install the USB-to-serial driver.
6. Open Device Manager and record the COM port, for example `COM3` or `COM4`.
7. Confirm Python is 64-bit:

```powershell
python -c "import struct; print(str(struct.calcsize('P') * 8) + '-bit')"
```

## Clone And Bootstrap

```powershell
git clone https://github.com/lulf87/yyt1771-g3-af-workstation.git
cd yyt1771-g3-af-workstation
git checkout codex/windows-native-hardware-support
.\scripts\windows\bootstrap.ps1
```

`bootstrap.ps1` checks Python and Node, creates `.venv`, installs backend requirements, and runs `npm install` in `frontend`.

## Offline/Simulated Mode

Offline/simulated mode does not connect to a real camera or temperature controller. It can open Operator Mode, choose an offline dataset, probe the current frame, run simulated tests, show curves/results, and export artifacts.

Copy the simulated profile:

```powershell
copy configs\hardware\simulated.windows.example.yaml configs\local\simulated.local.yaml
```

Configure offline datasets in `configs\local\offline_datasets.local.json`. Use Windows paths, for example:

```json
{
  "id": "golden_a_20260522_dev_lab",
  "root_path": "D:/YYT1771/datasets/20260522-183158-dev_lab"
}
```

Then start Operator Mode:

```powershell
.\scripts\windows\start_operator.ps1 -Config configs\local\simulated.local.yaml
```

Choose `Offline dataset` in Operator Mode. Real hardware is not required for offline dataset probing or simulated runs.

## Real Hardware Mode

Copy the real hardware profile:

```powershell
copy configs\hardware\realcamera_temp.windows.example.yaml configs\local\realcamera_temp.local.yaml
```

Edit these fields in `configs\local\realcamera_temp.local.yaml`:

- `camera.sdk_python_paths`: path to the MVS `MvImport` directory.
- `camera.sdk_library_dir`: folder containing `MvCameraControl.dll`.
- `camera.sdk_library_path`: full path to `MvCameraControl.dll`.
- `camera.model`, `camera.serial_number`, or `camera.ip` if you need a specific camera.
- `temp.serial.port`: the Device Manager COM port, for example `COM3`.

The example defaults are:

```yaml
camera:
  sdk_python_paths:
    - "C:/Program Files (x86)/MVS/Development/Samples/Python/MvImport"
  sdk_library_dir: "C:/Program Files (x86)/MVS/Development/Libraries/win64"
  sdk_library_path: "C:/Program Files (x86)/MVS/Development/Libraries/win64/MvCameraControl.dll"
  simulated_dataset_id: ""
temp:
  serial:
    port: "COM3"
```

Start Operator Mode:

```powershell
.\scripts\windows\start_operator.ps1 -Config configs\local\realcamera_temp.local.yaml
```

The browser opens:

```text
http://127.0.0.1:5176/?mode=operator
```

Check source status:

```text
http://127.0.0.1:8022/api/operator/source-status
```

For real-camera Operator Mode, `real_hardware_available` must be `true`. If it is `false`, the UI must show real hardware unavailable and must not silently fall back to a simulated camera.

## Manual Startup

Backend:

```powershell
.\scripts\windows\start_backend.ps1 -Config configs\local\realcamera_temp.local.yaml -Port 8022
```

Frontend:

```powershell
.\scripts\windows\start_frontend.ps1 -ApiBase http://127.0.0.1:8022 -Port 5176
```

PowerShell environment-variable syntax for frontend development:

```powershell
$env:VITE_G3_API_BASE = "http://127.0.0.1:8022"
npm run dev -- --port 5176
```

## Environment Check

Run:

```powershell
.\scripts\windows\check_environment.ps1 -Config configs\local\realcamera_temp.local.yaml
```

It prints Python version, Python architecture, Node/npm versions, SDK paths, whether `MvCameraControl_class.py` and `MvCameraControl.dll` exist, COM ports, backend health if running, and `source-status` if running.

## Common Issues

- `MvCameraControl_class not found`: set `camera.sdk_python_paths` to the MVS `MvImport` directory or set `HIK_MVS_PYTHON_PATH`.
- `MvCameraControl.dll not found`: set `camera.sdk_library_dir` to the folder containing the DLL, or set `HIK_MVS_LIBRARY_DIR`.
- `DLL load failed`: check 32/64-bit mismatch, PATH, Visual C++ runtime dependencies, and the MVS install path.
- `No Hik cameras discovered`: confirm MVS Viewer sees the camera first.
- Camera IP not in same subnet: set the NIC IP and camera IP to compatible addresses.
- Firewall blocked: allow MVS and Python through Windows Firewall for the camera network.
- `COM port not found`: change `temp.serial.port` to the Device Manager COM port.
- Access denied to COM port: close other software that opened the port.
- Python is not x64: install Python 3.11 x64 and recreate `.venv`.
- MVS installation path differs: edit YAML or set environment variables.
- Frontend points at the wrong backend: set `VITE_G3_API_BASE` to `http://127.0.0.1:8022`.

## Final hardware validation checklist

- Open MVS Viewer and confirm the camera is visible.
- Confirm the camera IP and NIC IP are in the same subnet.
- Confirm the `MvCameraControl.dll` path.
- Confirm the `MvCameraControl_class.py` path.
- Confirm Python is 64-bit.
- Confirm the temperature controller COM port.
- Start the backend.
- Open `/api/operator/source-status`.
- Confirm `real_hardware_available` is `true`.
- Open Operator Mode.
- Select real camera.
- Probe current frame.
- Start real-time test.
- Stop and export results.
