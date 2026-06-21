$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$source = Join-Path $PSScriptRoot 'YouthLeagueLauncher.cs'
$output = Join-Path $root 'YouthLeagueLauncher.exe'

if (Test-Path $output) {
    Remove-Item -LiteralPath $output -Force
}

Add-Type -Path $source -OutputAssembly $output -OutputType ConsoleApplication

Write-Host "Generated: $output"
