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
