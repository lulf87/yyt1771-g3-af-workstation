# G3 Production Device Setup

## Production Runtime Contract

Production delivery uses one actual-use Operator UI and selects acquisition source before backend startup. Engineering mode, offline dataset selection, and source switching are not exposed in the normal browser entry.

```bash
YYT1771_G3_RUNTIME_SOURCE=real_hardware \
YYT1771_G3_PRODUCT_MODE=production \
scripts/g3_start.sh real
```

For development demonstrations only:

```bash
YYT1771_G3_PRODUCT_MODE=development scripts/g3_start.sh sim
```

Production rejects simulated-material startup. Real-hardware mode requires a real camera and real temperature backend and never falls back to simulated devices. If either device is unavailable or the profile is simulated, Probe and Start stay disabled and Device setup remains available.

This document describes the production first-run binding flow for a new G3 workstation computer.

## When To Run Device Setup

Run `设备设置 / Device setup` the first time the software is installed on a new computer, or whenever any of the following changes:

- The Hikrobot camera is replaced.
- The camera serial number is different from the saved binding.
- The camera IP changes and the current binding no longer connects.
- The LU92XX temperature controller is moved to a different USB serial port.
- The local hardware config was deleted or reset.

## Binding Rules

- Bind Hikrobot cameras by `serial_number` first.
- Save the camera IP as diagnostic connection metadata, but do not rely on IP as the primary identity when a serial number is available.
- Production Operator mode only accepts supported camera models from `camera.allowed_models`.
- Engineering implementation may remain in development branches, but production UI has no Engineering entry.
- Do not manually edit `configs/hardware/*.example.yaml`.
- Do not commit local hardware YAML to Git.

## Local Config Location

The setup wizard saves the production binding to:

```text
configs/local/realcamera_temp.local.yaml
```

This path is ignored by Git through:

```text
configs/local/*.yaml
```

If an advanced deployment explicitly chooses another writable local path, use a local-only file such as:

```text
output/config/hardware_profile.local.yaml
```

The backend rejects writes to example/template config files.

## Hik MVS SDK Paths

On a new computer, install Hikrobot MVS before running real-camera setup. If the environment check reports that `MvCameraControl_class` or the MVS dynamic library is missing, configure the local profile, not an example YAML.

Edit or create:

```text
configs/local/realcamera_temp.local.yaml
```

Set these fields under `camera`:

```yaml
camera:
  sdk_python_paths:
    - /Applications/MVS.app/Contents/Resources/MvImport
  sdk_library_path: /Applications/MVS.app/Contents/Frameworks/libMvCameraControl.dylib
```

Common candidate paths:

```text
macOS SDK Python path:
  /Applications/MVS.app/Contents/Resources/MvImport

macOS dynamic library:
  /Applications/MVS.app/Contents/Frameworks/libMvCameraControl.dylib

Linux SDK Python path:
  /opt/MVS/Samples/Python/MvImport

Linux dynamic library:
  /opt/MVS/lib/64/libMvCameraControl.so

Windows SDK Python path:
  C:\Program Files (x86)\MVS\Development\Samples\Python\MvImport

Windows SDK library dir:
  C:\Program Files (x86)\MVS\Development\Libraries\win64

Windows dynamic library:
  C:\Windows\System32\MvCameraControl.dll
```

Environment variables are also supported for advanced deployments:

```text
HIK_MVS_PYTHON_PATH
HIK_MVS_LIBRARY_PATH
```

After changing SDK paths, restart the backend and rerun `设备设置 / Environment check`. The setup wizard preserves existing SDK path fields when it saves camera and temperature bindings.

## First-Run Wizard Checklist

1. Open Operator mode.
2. If real hardware is unavailable, click `打开设备设置`.
3. Confirm the environment check:
   - Backend is running.
   - Hik MVS Python binding can be imported.
   - MVS dynamic library path is configured.
   - Temperature serial ports can be read.
4. Scan cameras:
   - If no camera is found, the wizard shows `未发现 Hik 相机` and disables next.
   - If one supported camera is found, it can be preselected but must still be tested.
   - If multiple cameras are found, choose the intended camera manually.
5. Test camera:
   - Confirm model, serial number, and IP.
   - Click `测试相机`.
   - Confirm a preview image is shown.
6. Select and test the LU92XX serial port:
   - Choose the current serial port.
   - Click `测试温控`.
   - Confirm a temperature value is shown.
7. Run the combined binding test.
8. Save configuration.
9. Confirm Operator mode refreshes source status:
   - If hardware is available, it should show `真实相机 + 真实温控`.
   - If hardware is still unavailable, it should show `配置已保存，但真实硬件仍不可用，请检查相机和温控。`

## Current Verification Note

The no-camera setup flow can be browser-tested without a Hik camera. Full camera binding save, preview test, temperature test, and production start remain required on-site verification steps when a discoverable Hik camera and LU92XX controller are connected.
