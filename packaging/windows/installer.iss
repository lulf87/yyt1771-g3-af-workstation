#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\build\windows\dist\YYT1771-G3"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\build\windows"
#endif

[Setup]
AppId={{E36C5C6C-5619-42C5-A193-E92CE903E7C2}
AppName=YY/T 1771 G3 工作站
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\YYT1771-G3
DefaultGroupName=YY/T 1771 G3 工作站
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
OutputDir={#OutputDir}
OutputBaseFilename=YYT1771-G3-Setup-{#MyAppVersion}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\G3Workstation.exe
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{commonappdata}\YYT1771-G3\config"; Permissions: users-modify
Name: "{commonappdata}\YYT1771-G3\data\runs"; Permissions: users-modify
Name: "{commonappdata}\YYT1771-G3\cache"; Permissions: users-modify

[Icons]
Name: "{group}\YY/T 1771 G3 工作站"; Filename: "{app}\G3Workstation.exe"
Name: "{autodesktop}\YY/T 1771 G3 工作站"; Filename: "{app}\G3Workstation.exe"; Tasks: desktopicon
Name: "{group}\查看日志"; Filename: "explorer.exe"; Parameters: """{localappdata}\YYT1771-G3\logs"""

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："; Flags: unchecked

[Run]
Filename: "{app}\G3Workstation.exe"; Description: "启动 YY/T 1771 G3 工作站"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\YYT1771-G3\cache"

[Code]
var
  HardwarePrereqPage: TOutputMsgMemoWizardPage;

function MvsPythonBindingPath(): String;
begin
  Result := ExpandConstant('{pf32}\MVS\Development\Samples\Python\MvImport\MvCameraControl_class.py');
end;

function MvsRuntimePath(): String;
begin
  Result := ExpandConstant('{cf32}\MVS\Runtime\Win64_x64\MvCameraControl.dll');
end;

function PrerequisiteStatusText(): String;
var
  MvsBindingFound: Boolean;
  MvsRuntimeFound: Boolean;
begin
  MvsBindingFound := FileExists(MvsPythonBindingPath());
  MvsRuntimeFound := FileExists(MvsRuntimePath());
  Result :=
    '已包含，无需预装：' + #13#10 +
    '  • Python x64 及 G3 后端依赖' + #13#10 +
    '  • 已编译网页（无需 Node.js）' + #13#10 +
    '  • 无需 Git / Git Bash' + #13#10#13#10 +
    '真实硬件前置检查：' + #13#10;
  if MvsBindingFound and MvsRuntimeFound then
    Result := Result + '  ✓ 已检测到 Hikrobot MVS Python Binding 和 Win64_x64 Runtime' + #13#10
  else
  begin
    Result := Result + '  ! 未完整检测到 Hikrobot MVS x64；请安装厂商 MVS 和 GigE 驱动' + #13#10;
    Result := Result + '    Python Binding: ' + MvsPythonBindingPath() + #13#10;
    Result := Result + '    x64 Runtime: ' + MvsRuntimePath() + #13#10;
  end;
  Result := Result +
    '  • USB 转串口驱动需匹配实际转换器芯片；连接后在 G3 设备向导中选择 COM 口' + #13#10 +
    '  • GigE 相机网卡需设为与相机同网段的静态 IPv4' + #13#10#13#10 +
    '安装完成后 G3 会自动识别标准 MVS 路径。非标准路径可在“设备设置 → 环境检查”中验证并保存。';
end;

procedure InitializeWizard();
begin
  HardwarePrereqPage := CreateOutputMsgMemoPage(
    wpSelectTasks,
    '真实硬件前置检查',
    '请确认这台电脑已具备相机和温控连接条件',
    '第三方厂商驱动不在 G3 安装包中。即使尚未安装驱动，也可继续安装 G3，然后在设备向导中查看具体错误。',
    PrerequisiteStatusText()
  );
end;
