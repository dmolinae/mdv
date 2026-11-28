#define MyAppName "mdv"
#define MyAppVersion "2.1.0"
#define MyAppPublisher "Daniel Molina"
#define MyAppURL "https://github.com/dmolinae/mdv"
#define MyAppExeName "mdv.exe"

[Setup]
AppId={{8D4F9B3A-5A1E-4C20-9E71-8A4C72D19E02}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\dist
OutputBaseFilename=mdv-setup-x64
SetupIconFile=..\..\assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ChangesEnvironment=yes
ChangesAssociations=yes
CloseApplications=force

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "addtopath"; Description: "Añadir mdv al PATH del usuario (recomendado para PowerShell / Terminal)"; GroupDescription: "Integración con el sistema:"
Name: "contextmenu"; Description: "Añadir 'Abrir carpeta en mdv' al menú contextual del Explorador"; GroupDescription: "Integración con el sistema:"
Name: "assocmd"; Description: "Asociar archivos .md y .markdown con mdv"; GroupDescription: "Integración con el sistema:"; Flags: unchecked

[Files]
Source: "..\..\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{%USERPROFILE|C:\}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Parameters: "-- ""{%USERPROFILE|C:\}"""; WorkingDir: "{%USERPROFILE|C:\}"; Description: "Abrir {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Registry]
; Folder context menu ("Abrir en mdv")
Root: HKA; Subkey: "Software\Classes\Directory\shell\mdv"; ValueType: string; ValueName: ""; ValueData: "Abrir en mdv"; Flags: uninsdeletekey; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\mdv"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#MyAppExeName}"",0"; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\mdv\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" -- ""%V"""; Tasks: contextmenu

Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\mdv"; ValueType: string; ValueName: ""; ValueData: "Abrir carpeta en mdv"; Flags: uninsdeletekey; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\mdv"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#MyAppExeName}"",0"; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\mdv\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" -- ""%V"""; Tasks: contextmenu

; Optional .md / .markdown file association
Root: HKA; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "mdv.MarkdownFile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assocmd
Root: HKA; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueType: string; ValueName: "mdv.MarkdownFile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assocmd
Root: HKA; Subkey: "Software\Classes\mdv.MarkdownFile"; ValueType: string; ValueName: ""; ValueData: "Documento Markdown (mdv)"; Flags: uninsdeletekey; Tasks: assocmd
Root: HKA; Subkey: "Software\Classes\mdv.MarkdownFile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"",0"; Tasks: assocmd
Root: HKA; Subkey: "Software\Classes\mdv.MarkdownFile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" -- ""%1"""; Tasks: assocmd

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  PathVal: string;
  AppDir: string;
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
  begin
    AppDir := ExpandConstant('{app}');
    if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', PathVal) then
      PathVal := '';
    if Pos(LowerCase(AppDir), LowerCase(PathVal)) = 0 then
    begin
      if (Length(PathVal) > 0) and (PathVal[Length(PathVal)] <> ';') then
        PathVal := PathVal + ';';
      PathVal := PathVal + AppDir;
      RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', PathVal);
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  PathVal, AppDir: string;
  P: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    AppDir := ExpandConstant('{app}');
    if RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', PathVal) then
    begin
      P := Pos(';' + LowerCase(AppDir), LowerCase(PathVal));
      if P > 0 then
      begin
        Delete(PathVal, P, Length(AppDir) + 1);
        RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', PathVal);
      end
      else
      begin
        P := Pos(LowerCase(AppDir) + ';', LowerCase(PathVal));
        if P > 0 then
        begin
          Delete(PathVal, P, Length(AppDir) + 1);
          RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', PathVal);
        end;
      end;
    end;
  end;
end;
