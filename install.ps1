$ErrorActionPreference = "Stop"
$Repo = "dmolinae/mdv"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\mdv"

Write-Host "==> Buscando la última versión de mdv en GitHub Releases..." -ForegroundColor Cyan
$Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"

$SetupAsset = $Release.assets | Where-Object { $_.name -eq "mdv-setup-x64.exe" } | Select-Object -First 1
$ZipAsset   = $Release.assets | Where-Object { $_.name -eq "mdv-windows-x86_64.zip" } | Select-Object -First 1

if ($SetupAsset) {
    $TmpSetup = Join-Path $env:TEMP "mdv-setup-x64.exe"
    Write-Host "==> Descargando instalador $($SetupAsset.name) ($($Release.tag_name))..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $SetupAsset.browser_download_url -OutFile $TmpSetup
    Write-Host "==> Ejecutando instalador silencioso..." -ForegroundColor Cyan
    Start-Process -FilePath $TmpSetup -ArgumentList "/VERYSILENT" -Wait
    Remove-Item $TmpSetup -Force -ErrorAction SilentlyContinue
} elseif ($ZipAsset) {
    $TmpZip = Join-Path $env:TEMP "mdv-windows-x86_64.zip"
    Write-Host "==> Descargando paquete $($ZipAsset.name)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $ZipAsset.browser_download_url -OutFile $TmpZip
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Expand-Archive -Path $TmpZip -DestinationPath $InstallDir -Force
    Remove-Item $TmpZip -Force -ErrorAction SilentlyContinue
} else {
    throw "No se encontró el binario de Windows en el último release de $Repo."
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    $env:Path = "$env:Path;$InstallDir"
} elseif ($env:Path -notlike "*$InstallDir*") {
    $env:Path = "$env:Path;$InstallDir"
}

Write-Host "✓ ¡mdv $($Release.tag_name) instalado en $InstallDir!" -ForegroundColor Green
Write-Host "  Ejecuta 'mdv' en cualquier carpeta desde PowerShell o Windows Terminal."
