<#
.SYNOPSIS
  Sao lưu database PostgreSQL (chạy trong container Docker) ra file .dump (định dạng custom của pg_dump).

.DESCRIPTION
  - Chỉ ĐỌC database nguồn, không thay đổi dữ liệu.
  - File lưu tại thư mục backups\ (đã nằm trong .gitignore — KHÔNG commit, có thể chứa dữ liệu cá nhân).
  - Kèm file .sha256 để kiểm tra toàn vẹn khi phục hồi.

.EXAMPLE
  npm run db:backup
  npm run db:backup -- -Database web_kpi_dev
#>
param(
  [string]$Database = 'web_kpi_dev',
  [string]$Container = 'web-kpi-db',
  [string]$OutDir = (Join-Path $PSScriptRoot '..\backups')
)
$ErrorActionPreference = 'Stop'
$dockerBin = 'C:\Users\admin\AppData\Local\Programs\DockerDesktop\resources\bin'
if (-not (Get-Command docker -ErrorAction SilentlyContinue) -and (Test-Path $dockerBin)) { $env:PATH += ";$dockerBin" }

$user = "$(docker exec $Container printenv POSTGRES_USER)".Trim()
if (-not $user) { throw "Không đọc được POSTGRES_USER từ container $Container (Docker đã chạy chưa?)" }

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$name = "$Database-$stamp.dump"
$target = Join-Path (Resolve-Path $OutDir) $name

Write-Host "Đang sao lưu database '$Database'..."
docker exec $Container pg_dump -U $user -d $Database -Fc --no-owner -f "/tmp/$name"
if ($LASTEXITCODE -ne 0) { throw 'pg_dump thất bại' }
docker cp "${Container}:/tmp/$name" $target | Out-Null
docker exec $Container rm -f "/tmp/$name" | Out-Null

$hash = (Get-FileHash $target -Algorithm SHA256).Hash.ToLower()
Set-Content -Path "$target.sha256" -Value "$hash  $name" -Encoding ascii
$size = [math]::Round((Get-Item $target).Length / 1KB, 1)
Write-Host "Đã sao lưu: $target ($size KB)"
Write-Host "SHA-256:    $hash"
