<#
.SYNOPSIS
  Phục hồi một bản sao lưu .dump vào một database MỚI (không ghi đè database đang dùng).

.DESCRIPTION
  - Kiểm tra mã SHA-256 (nếu có file .sha256 đi kèm).
  - Tạo database đích MỚI; nếu tên đã tồn tại thì DỪNG (không xóa, không ghi đè).
  - Sau khi phục hồi in số bản ghi của các bảng chính để đối chiếu.
  - Muốn chạy ứng dụng trên bản phục hồi: đổi DATABASE_URL trong .env sang database mới (xem README).

.EXAMPLE
  npm run db:restore -- -File backups\web_kpi_dev-20261011-210000.dump
  npm run db:restore -- -File backups\x.dump -Target web_kpi_restore_thu
#>
param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$Target = ('web_kpi_restore_' + (Get-Date -Format 'yyyyMMdd_HHmmss')),
  [string]$Container = 'web-kpi-db'
)
$ErrorActionPreference = 'Stop'
$dockerBin = 'C:\Users\admin\AppData\Local\Programs\DockerDesktop\resources\bin'
if (-not (Get-Command docker -ErrorAction SilentlyContinue) -and (Test-Path $dockerBin)) { $env:PATH += ";$dockerBin" }

if ($Target -notmatch '^[a-z_][a-z0-9_]{0,62}$') { throw "Tên database đích không hợp lệ: $Target (chỉ chữ thường, số, _)" }
$path = Resolve-Path $File
$sumFile = "$path.sha256"
if (Test-Path $sumFile) {
  $expected = ((Get-Content $sumFile -Raw).Trim() -split '\s+')[0]
  $actual = (Get-FileHash $path -Algorithm SHA256).Hash.ToLower()
  if ($expected -ne $actual) { throw "Sai mã SHA-256 — file sao lưu có thể đã bị thay đổi hoặc hỏng. Dừng phục hồi." }
  Write-Host 'Mã SHA-256 khớp.'
} else {
  Write-Warning 'Không có file .sha256 đi kèm — bỏ qua kiểm tra toàn vẹn.'
}

$user = "$(docker exec $Container printenv POSTGRES_USER)".Trim()
if (-not $user) { throw "Không đọc được POSTGRES_USER từ container $Container (Docker đã chạy chưa?)" }
$exists = "$(docker exec $Container psql -U $user -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Target'")".Trim()
if ($exists -eq '1') { throw "Database '$Target' đã tồn tại — script không ghi đè. Chọn tên khác bằng -Target." }

Write-Host "Tạo database mới '$Target' và phục hồi..."
docker exec $Container psql -U $user -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $Target" | Out-Null
$name = Split-Path $path -Leaf
docker cp $path "${Container}:/tmp/$name" | Out-Null
docker exec $Container pg_restore -U $user -d $Target --no-owner --exit-on-error "/tmp/$name"
$code = $LASTEXITCODE
docker exec $Container rm -f "/tmp/$name" | Out-Null
if ($code -ne 0) { throw "pg_restore thất bại (database '$Target' có thể chưa đầy đủ — kiểm tra rồi tự xử lý)" }

Write-Host "Đã phục hồi vào database '$Target'. Số bản ghi các bảng chính:"
$sql = "SELECT 'users', count(*) FROM users UNION ALL SELECT 'employees', count(*) FROM employees UNION ALL SELECT 'evaluation_records', count(*) FROM evaluation_records UNION ALL SELECT 'evaluation_calculations', count(*) FROM evaluation_calculations UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs UNION ALL SELECT '_prisma_migrations', count(*) FROM _prisma_migrations"
docker exec $Container psql -U $user -d $Target -tA -F ' : ' -c $sql
