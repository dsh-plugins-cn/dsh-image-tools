<#
.SYNOPSIS
  Install (or remove / roll back) the dsh-image-tools plugin in a DSH profile.

.DESCRIPTION
  Copies this directory into <DSH_HOME>\profiles\<profile>\node_modules\dsh-image-tools,
  then records the package in both dsh.profile.bundles and dependencies. The
  dependency entry matters: the plugin manager prunes node_modules entries that
  are not declared.

  The first install saves package.json.bak-before-image-tools, which -Rollback
  restores.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile imagecheck
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Doctor -Profile imagecheck
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Rollback -Profile desktop
#>
param(
  [string]$Profile = $(if ($env:DSH_PROFILE) { $env:DSH_PROFILE } else { 'desktop' }),
  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }),
  [switch]$Uninstall,
  [switch]$Rollback,
  [switch]$Doctor
)

$ErrorActionPreference = 'Stop'
$name = 'dsh-image-tools'
$source = $PSScriptRoot
$profileDir = Join-Path $DshHome (Join-Path 'profiles' $Profile)
$manifest = Join-Path $profileDir 'package.json'
$dest = Join-Path $profileDir (Join-Path 'node_modules' $name)
$backup = "$manifest.bak-before-image-tools"

if (-not (Test-Path $manifest)) {
  throw "Profile manifest not found: $manifest (check -Profile / -DshHome)"
}

function Read-Manifest {
  return Get-Content -Raw -Encoding UTF8 $manifest | ConvertFrom-Json
}

function Write-Manifest($json) {
  $text = ($json | ConvertTo-Json -Depth 32)
  [IO.File]::WriteAllText($manifest, $text + "`n", (New-Object System.Text.UTF8Encoding -ArgumentList $false))
}

function Get-Bundles($json) {
  if ($json.dsh -and $json.dsh.profile -and $json.dsh.profile.bundles) { return @($json.dsh.profile.bundles) }
  return @()
}

function Get-Deps($json) {
  $deps = @{}
  if ($json.dependencies) { $json.dependencies.PSObject.Properties | ForEach-Object { $deps[$_.Name] = $_.Value } }
  return $deps
}

function Remove-PluginDir([string]$target) {
  if (-not (Test-Path $target)) { return }
  $item = Get-Item $target -Force
  if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
    cmd /c rmdir "$target" | Out-Null
  } else {
    Remove-Item -Recurse -Force $target
  }
}

if ($Doctor) {
  $json = Read-Manifest
  $bundles = @(Get-Bundles $json)
  Write-Host "DSH_HOME:            $DshHome"
  Write-Host "profile:             $Profile"
  Write-Host "profile dir:         $profileDir"
  Write-Host "bundle registered:   $($bundles -contains $name)"
  $installedManifest = Join-Path $dest 'package.json'
  if (Test-Path $installedManifest) {
    $installed = (Get-Content -Raw -Encoding UTF8 $installedManifest | ConvertFrom-Json).version
    $build = ''
    if (Test-Path (Join-Path $dest 'index.js')) {
      $m = [regex]::Match((Get-Content -Raw -Encoding UTF8 (Join-Path $dest 'index.js')), "const BUILD = '([^']+)'")
      if ($m.Success) { $build = $m.Groups[1].Value }
    }
    Write-Host "installed version:   $installed"
    Write-Host "host build:          $build"
    if ($build -ne '' -and $build -ne $installed) { Write-Warning "host build ($build) does not match package version ($installed); reinstall the plugin." }
  } else {
    Write-Host "installed version:   (not installed in this profile)"
  }
  Write-Host "client bundle:       $(Test-Path (Join-Path $dest 'client.js'))"
  return
}

if ($Rollback) {
  if (Test-Path $backup) {
    Copy-Item $manifest "$manifest.bak-rollback" -Force
    Copy-Item $backup $manifest -Force
    Write-Host "restored profile manifest from $backup"
  } else {
    $json = Read-Manifest
    $bundles = @(Get-Bundles $json) | Where-Object { $_ -ne $name }
    $deps = Get-Deps $json
    $deps.Remove($name)
    $json.dsh.profile.bundles = @($bundles)
    $json.dependencies = [pscustomobject]$deps
    Write-Manifest $json
    Write-Host "removed $name from bundles/dependencies (no pre-install backup found)"
  }
  Remove-PluginDir $dest
  Write-Host "rollback done. Restart DSH to unload the plugin."
  return
}

$json = Read-Manifest
$bundles = @(Get-Bundles $json)

if ($Uninstall) {
  $deps = Get-Deps $json
  $deps.Remove($name)
  Copy-Item $manifest "$manifest.bak-uninstall" -Force
  $json.dsh.profile.bundles = @($bundles | Where-Object { $_ -ne $name })
  $json.dependencies = [pscustomobject]$deps
  Write-Manifest $json
  Remove-PluginDir $dest
  Write-Host "uninstalled $name from profile '$Profile'"
  return
}

if (-not (Test-Path (Join-Path $source 'index.js'))) {
  throw "Not a plugin directory (index.js missing): $source"
}

New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Remove-PluginDir $dest
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$exclude = @('.git', 'node_modules', 'dist', 'docs', '.github', 'scripts', 'test')
Get-ChildItem $source -Force |
  Where-Object { $exclude -notcontains $_.Name -and $_.Name -ne 'install.ps1' } |
  ForEach-Object { Copy-Item $_.FullName -Destination $dest -Recurse -Force }
Copy-Item $PSCommandPath (Join-Path $dest 'install.ps1') -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $backup)) { Copy-Item $manifest $backup -Force }

$sourcePosix = ($source -replace '\\', '/')
$deps = Get-Deps $json
$deps[$name] = "file:$sourcePosix"
$newBundles = @($bundles | Where-Object { $_ -ne $name }) + $name
if ($bundles -ne $newBundles -or $deps[$name] -ne $json.dependencies.$name) {
  Copy-Item $manifest "$manifest.bak-install" -Force
}
$json.dsh.profile.bundles = @($newBundles)
$json.dependencies = [pscustomobject]$deps
Write-Manifest $json

Write-Host ""
Write-Host "installed: $dest"
Write-Host "profile:   $profileDir"
Write-Host "restart DSH to load the plugin (the running instance does not hot-load bundles)"
Write-Host "rollback:  .\install.ps1 -Rollback -Profile $Profile"