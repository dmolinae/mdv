#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(not(windows))]
fn main() {
    eprintln!("mdv-setup is the Windows installer target (x86_64-pc-windows-msvc).");
}

#[cfg(windows)]
mod win_setup {
    use std::env;
    use std::fs;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const MB_YESNO: u32 = 0x00000004;
    const MB_OK: u32 = 0x00000000;
    const MB_ICONINFORMATION: u32 = 0x00000040;
    const MB_ICONQUESTION: u32 = 0x00000020;
    const MB_ICONERROR: u32 = 0x00000010;
    const IDYES: i32 = 6;

    const HWND_BROADCAST: isize = 0xffff;
    const WM_SETTINGCHANGE: u32 = 0x001A;
    const SMTO_ABORTIFHUNG: u32 = 0x0002;

    static EMBEDDED_MDV_EXE: &[u8] = include_bytes!(env!("MDV_EXE_PATH"));

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, utype: u32) -> i32;
        fn SendMessageTimeoutW(
            hwnd: isize,
            msg: u32,
            wparam: usize,
            lparam: *const u16,
            flags: u32,
            timeout: u32,
            result: *mut usize,
        ) -> isize;
    }

    fn to_wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    fn msg_box(title: &str, body: &str, flags: u32) -> i32 {
        let t = to_wide(title);
        let b = to_wide(body);
        unsafe { MessageBoxW(0, b.as_ptr(), t.as_ptr(), flags) }
    }

    fn broadcast_env_change() {
        let env_wide = to_wide("Environment");
        let mut res: usize = 0;
        unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0,
                env_wide.as_ptr(),
                SMTO_ABORTIFHUNG,
                2500,
                &mut res,
            );
        }
    }

    fn run_ps(script: &str) -> Result<(), String> {
        let out = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    }

    fn install_dir() -> PathBuf {
        let local = env::var("LOCALAPPDATA").unwrap_or_else(|_| r"C:\Users\Public".to_string());
        PathBuf::from(local).join("Programs").join("mdv")
    }

    pub fn run() {
        let args: Vec<String> = env::args().skip(1).collect();
        let silent = args.iter().any(|a| {
            let u = a.to_ascii_uppercase();
            u == "/S" || u == "/VERYSILENT" || u == "/SILENT" || u == "--SILENT"
        });
        let uninstall = args.iter().any(|a| a.eq_ignore_ascii_case("--uninstall") || a.eq_ignore_ascii_case("/uninstall"));

        if uninstall {
            run_uninstall(silent);
        } else {
            run_install(silent);
        }
    }

    fn run_install(silent: bool) {
        let dir = install_dir();
        if !silent {
            let prompt = format!(
                "¿Deseas instalar mdv v2.0.0 en Windows?\n\n\
                 Carpeta de destino:\n  {}\n\n\
                 Se configurará automáticamente:\n\
                 • Ejecutable nativo mdv.exe (Rust)\n\
                 • Comando 'mdv' añadido a tu PATH de usuario\n\
                 • 'Abrir en mdv' en el menú contextual de carpetas\n\
                 • Acceso directo en el Menú Inicio y Desinstalador",
                dir.display()
            );
            if msg_box("Instalador de mdv v2.0.0", &prompt, MB_YESNO | MB_ICONQUESTION) != IDYES {
                return;
            }
        }

        if let Err(e) = perform_install(&dir) {
            if !silent {
                msg_box(
                    "Error al instalar mdv",
                    &format!("No se pudo completar la instalación:\n{}", e),
                    MB_OK | MB_ICONERROR,
                );
            }
            std::process::exit(1);
        }

        broadcast_env_change();

        if !silent {
            msg_box(
                "Instalación completada — mdv v2.0.0",
                "✓ mdv v2.0.0 se instaló correctamente.\n\n\
                 • Ejecuta 'mdv' en cualquier carpeta desde Windows Terminal o PowerShell.\n\
                 • O haz clic derecho sobre cualquier carpeta y elige 'Abrir en mdv'.",
                MB_OK | MB_ICONINFORMATION,
            );
        }
    }

    fn perform_install(dir: &Path) -> Result<(), String> {
        fs::create_dir_all(dir).map_err(|e| format!("Crear directorio: {}", e))?;
        let exe_path = dir.join("mdv.exe");
        let uninst_path = dir.join("mdv-uninstall.exe");

        // Write mdv.exe
        fs::write(&exe_path, EMBEDDED_MDV_EXE)
            .map_err(|e| format!("Escribir mdv.exe (cierra ventanas activas de mdv e intenta de nuevo): {}", e))?;

        // Copy current setup binary as uninstaller
        if let Ok(self_exe) = env::current_exe() {
            if self_exe != uninst_path {
                let _ = fs::copy(&self_exe, &uninst_path);
            }
        }

        let dir_esc = dir.to_string_lossy().replace('\'', "''");
        let exe_esc = exe_path.to_string_lossy().replace('\'', "''");
        let uninst_esc = uninst_path.to_string_lossy().replace('\'', "''");

        let ps_script = format!(
            r#"
$ErrorActionPreference = 'Stop'
$AppDir = '{dir_esc}'
$ExePath = '{exe_esc}'
$UninstPath = '{uninst_esc}'

# 1. Add to HKCU Environment\Path cleanly preserving unexpanded REG_EXPAND_SZ
$EnvKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
$RawPath = $EnvKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$Parts = $RawPath -split ';' | Where-Object {{ $_ -ne '' }}
if (-not ($Parts | Where-Object {{ $_.TrimEnd('\') -ieq $AppDir.TrimEnd('\') }})) {{
    $NewPath = if ($RawPath -and -not $RawPath.EndsWith(';')) {{ "$RawPath;$AppDir" }} else {{ "$RawPath$AppDir" }}
    $EnvKey.SetValue('Path', $NewPath, [Microsoft.Win32.RegistryValueKind]::ExpandString)
}}
$EnvKey.Close()

# 2. Explorer Folder Context Menu ("Abrir en mdv")
foreach ($Base in @('HKCU:\Software\Classes\Directory\shell\mdv', 'HKCU:\Software\Classes\Directory\Background\shell\mdv')) {{
    New-Item -Path "$Base\command" -Force | Out-Null
    Set-ItemProperty -Path $Base -Name '(Default)' -Value 'Abrir en mdv'
    Set-ItemProperty -Path $Base -Name 'Icon' -Value "`"$ExePath`""
    Set-ItemProperty -Path "$Base\command" -Name '(Default)' -Value "`"$ExePath`" `"%V`""
}}

# 3. .md / .markdown Open With registration
New-Item -Path 'HKCU:\Software\Classes\mdv.MarkdownFile\shell\open\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\mdv.MarkdownFile' -Name '(Default)' -Value 'Markdown Document (mdv)'
Set-ItemProperty -Path 'HKCU:\Software\Classes\mdv.MarkdownFile\shell\open\command' -Name '(Default)' -Value "`"$ExePath`" `"%1`""
foreach ($Ext in @('.md', '.markdown')) {{
    New-Item -Path "HKCU:\Software\Classes\$Ext\OpenWithProgids" -Force | Out-Null
    New-ItemProperty -Path "HKCU:\Software\Classes\$Ext\OpenWithProgids" -Name 'mdv.MarkdownFile' -Value '' -PropertyType String -Force | Out-Null
}}

# 4. Start Menu Shortcut
$StartMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\mdv.lnk'
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($StartMenu)
$Shortcut.TargetPath = $ExePath
$Shortcut.Description = 'mdv — Modern Markdown & WSL Terminal Workspace'
$Shortcut.Save()

# 5. Windows Installed Apps Uninstall Entry
$UninstReg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\mdv'
New-Item -Path $UninstReg -Force | Out-Null
Set-ItemProperty -Path $UninstReg -Name 'DisplayName' -Value 'mdv (Markdown & WSL Viewer)'
Set-ItemProperty -Path $UninstReg -Name 'DisplayVersion' -Value '2.0.0'
Set-ItemProperty -Path $UninstReg -Name 'Publisher' -Value 'Daniel Molina'
Set-ItemProperty -Path $UninstReg -Name 'DisplayIcon' -Value $ExePath
Set-ItemProperty -Path $UninstReg -Name 'InstallLocation' -Value $AppDir
Set-ItemProperty -Path $UninstReg -Name 'UninstallString' -Value "`"$UninstPath`" --uninstall"
Set-ItemProperty -Path $UninstReg -Name 'QuietUninstallString' -Value "`"$UninstPath`" --uninstall --silent"
Set-ItemProperty -Path $UninstReg -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $UninstReg -Name 'NoRepair' -Value 1 -Type DWord
"#
        );

        run_ps(&ps_script)
    }

    fn run_uninstall(silent: bool) {
        let dir = install_dir();
        if !silent {
            if msg_box(
                "Desinstalar mdv",
                "¿Deseas desinstalar mdv de tu cuenta de Windows?",
                MB_YESNO | MB_ICONQUESTION,
            ) != IDYES
            {
                return;
            }
        }

        let dir_esc = dir.to_string_lossy().replace('\'', "''");
        let ps_script = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
$AppDir = '{dir_esc}'

$EnvKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
if ($EnvKey) {{
    $RawPath = $EnvKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $Filtered = ($RawPath -split ';' | Where-Object {{ $_ -ne '' -and ($_.TrimEnd('\') -ine $AppDir.TrimEnd('\')) }}) -join ';'
    $EnvKey.SetValue('Path', $Filtered, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    $EnvKey.Close()
}}

Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\mdv' -Recurse -Force
Remove-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\mdv' -Recurse -Force
Remove-Item -Path 'HKCU:\Software\Classes\mdv.MarkdownFile' -Recurse -Force
Remove-ItemProperty -Path 'HKCU:\Software\Classes\.md\OpenWithProgids' -Name 'mdv.MarkdownFile' -Force
Remove-ItemProperty -Path 'HKCU:\Software\Classes\.markdown\OpenWithProgids' -Name 'mdv.MarkdownFile' -Force
Remove-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\mdv' -Recurse -Force
Remove-Item -Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\mdv.lnk') -Force
Remove-Item -Path (Join-Path $AppDir 'mdv.exe') -Force
"#
        );
        let _ = run_ps(&ps_script);
        broadcast_env_change();

        // Schedule removal of folder & uninstaller binary after exit
        let _ = Command::new("cmd.exe")
            .args([
                "/C",
                &format!("ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{}\"", dir.display()),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        if !silent {
            msg_box(
                "Desinstalación completada",
                "mdv fue desinstalado correctamente.",
                MB_OK | MB_ICONINFORMATION,
            );
        }
    }
}

#[cfg(windows)]
fn main() {
    win_setup::run();
}
