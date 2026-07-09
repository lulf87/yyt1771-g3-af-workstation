# G3 Production Device Setup

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
- Engineering mode may still be used for diagnostics and broader hardware investigation.
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
