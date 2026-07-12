from pathlib import Path

from PyInstaller.utils.hooks import collect_all


repo = Path(SPECPATH).resolve().parents[1]
datas = [(str(repo / "frontend" / "dist"), "frontend/dist")]
hiddenimports = []
for package in ("cv2", "matplotlib", "scipy"):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    hiddenimports += package_hidden
    if package == "cv2":
        cv2_binaries = package_binaries
    elif package == "matplotlib":
        matplotlib_binaries = package_binaries
    else:
        scipy_binaries = package_binaries

binaries = cv2_binaries + matplotlib_binaries + scipy_binaries

a = Analysis(
    [str(repo / "backend" / "src" / "yyt1771_g3" / "launcher.py")],
    pathex=[str(repo / "backend" / "src")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["pytest", "httpx"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="G3Workstation",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name="YYT1771-G3",
)
