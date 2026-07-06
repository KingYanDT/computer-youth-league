$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$releaseRoot = Join-Path $root 'release'
$portable = Join-Path $releaseRoot 'youth-league-office-portable'
$zipPath = Join-Path $releaseRoot 'youth-league-office-portable.zip'

# 路径穿越校验：规范化后用目录分隔符后缀比较，避免 StartsWith 误判
# 例如 root="C:\proj" 不应放行 "C:\project-evil"
function Assert-UnderRoot($path) {
    $full = [System.IO.Path]::GetFullPath($path.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar)
    $rootFull = [System.IO.Path]::GetFullPath($root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar)
    if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside workspace: $full"
    }
}

Assert-UnderRoot $releaseRoot
Assert-UnderRoot $portable
Assert-UnderRoot $zipPath

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-launcher.ps1')

if (Test-Path $portable) {
    Remove-Item -LiteralPath $portable -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
New-Item -ItemType Directory -Force -Path $portable | Out-Null

$dirs = @(
    'backend',
    'database',
    'frontend',
    'node_modules',
    'tools\nodejs'
)

foreach ($dir in $dirs) {
    Copy-Item -LiteralPath (Join-Path $root $dir) -Destination (Join-Path $portable $dir) -Recurse -Force
}

$files = @(
    'YouthLeagueLauncher.exe',
    'package.json',
    'package-lock.json',
    '系统架构.md'
)

foreach ($file in $files) {
    $source = Join-Path $root $file
    if (Test-Path $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $portable $file) -Force
    }
}

$portableMySql = Join-Path $portable 'mysql'
New-Item -ItemType Directory -Force -Path $portableMySql | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableMySql 'bin') | Out-Null

Get-ChildItem -LiteralPath (Join-Path $root 'mysql\bin') -File |
    Where-Object { $_.Extension -ne '.pdb' } |
    Copy-Item -Destination (Join-Path $portableMySql 'bin') -Force

Copy-Item -LiteralPath (Join-Path $root 'mysql\share') -Destination (Join-Path $portableMySql 'share') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'mysql\LICENSE') -Destination (Join-Path $portableMySql 'LICENSE') -Force
Copy-Item -LiteralPath (Join-Path $root 'mysql\README') -Destination (Join-Path $portableMySql 'README') -Force

New-Item -ItemType Directory -Force -Path (Join-Path $portable 'uploads') | Out-Null

$jwtSecret = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
$envContent = @"
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=123456
DB_NAME=youth_league
MYSQL_DATA_DIR=C:\ProgramData\YouthLeagueOfficePortable\mysql-data
PORT=3000
JWT_SECRET=$jwtSecret
CORS_ORIGIN=http://localhost:3000
MAX_FILE_SIZE=10485760
"@
# 显式使用不带 BOM 的 UTF8 编码，避免 .env 首行被解析为带 BOM 的 key
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $portable '.env'), $envContent, $utf8NoBom)

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'PORTABLE_README.txt') -Destination (Join-Path $portable 'README.txt') -Force

Compress-Archive -LiteralPath $portable -DestinationPath $zipPath -Force

Write-Host "Portable folder: $portable"
Write-Host "Portable zip: $zipPath"
