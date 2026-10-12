#!/bin/sh
# Chạy một lần khi khởi tạo volume: tạo database riêng cho kiểm thử tự động.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE web_kpi_test OWNER "$POSTGRES_USER" ENCODING 'UTF8';
EOSQL
