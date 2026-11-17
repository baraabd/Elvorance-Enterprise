# Repair a Windows npm install blocked by a project-owned esbuild process.
# This tool never stops unrelated Node processes or touches project source files.
[CmdletBinding()]
param(
    [switch]$StopProjectProcesses,
    [switch]$CleanNodeModules,
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$manifest = Join-Path $root 'package-lock.json'
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw "Expected package-lock.json in project root: $root"
}

Set-Location -LiteralPath $root
Write-Host "Project root: $root"

function Get-ProjectProcesses {
    $all = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe' OR Name = 'esbuild.exe'" -ErrorAction Stop)
    return @($all | Where-Object {
        $commandLine = [string]$_.CommandLine
        $executable = [string]$_.ExecutablePath
        $commandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $executable.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0
    })
}

$processes = @(Get-ProjectProcesses)
if ($processes.Count -gt 0) {
    Write-Host 'Detected project-owned processes:'
    $processes | Select-Object ProcessId, Name, CommandLine | Format-Table -AutoSize
    if (-not $StopProjectProcesses) {
        throw 'Stop the listed processes manually, or rerun with -StopProjectProcesses.'
    }
    foreach ($process in $processes) {
        Write-Host ("Stopping PID " + $process.ProcessId + ": " + $process.Name)
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
}

$remaining = @(Get-ProjectProcesses)
if ($remaining.Count -gt 0) {
    throw 'Project processes remain active; do not remove node_modules until they stop.'
}

if ($CleanNodeModules) {
    $modules = Join-Path $root 'node_modules'
    if (Test-Path -LiteralPath $modules) {
        Write-Host "Removing incomplete dependency installation: $modules"
        Remove-Item -LiteralPath $modules -Recurse -Force -ErrorAction Stop
    }
}

if ($Install) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE. Review Windows file locks or antivirus logs."
    }
    & npm.cmd run check:types
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript verification failed with exit code $LASTEXITCODE."
    }
    Write-Host 'Dependency installation and TypeScript verification succeeded.'
} else {
    Write-Host 'No source files or dependencies were changed (unless -CleanNodeModules was specified).'
}
