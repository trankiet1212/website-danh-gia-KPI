/**
 * Khóa tư vấn (advisory lock) của PostgreSQL trong phạm vi transaction: tuần tự hóa các thao tác
 * "đọc số lớn nhất rồi tạo bản ghi mới" (số phiên bản, cây kỳ) khi nhiều người gửi cùng lúc.
 * Khóa tự nhả khi transaction kết thúc. Khóa theo chuỗi khóa nghiệp vụ (băm bằng hashtext).
 */
import type { Prisma } from '../generated/prisma/client.js';

export async function lockInTransaction(tx: Prisma.TransactionClient, key: string): Promise<void> {
  // Truy vấn tham số hóa (tagged template) — không ghép chuỗi SQL.
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}
