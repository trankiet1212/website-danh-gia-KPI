-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('ALL', 'UNITS', 'OWN_UNIT', 'MANAGED', 'SELF', 'NONE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('AGENCY', 'LEADERSHIP_BOARD', 'DEPARTMENT', 'OFFICE');

-- CreateEnum
CREATE TYPE "KpiProfile" AS ENUM ('LEADER', 'STAFF');

-- CreateEnum
CREATE TYPE "JobPositionGroup" AS ENUM ('LEADERSHIP', 'PROFESSIONAL', 'SHARED_SUPPORT');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('WORKING', 'TRANSFERRED', 'RETIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('PLANNING', 'OPEN', 'SELF_ASSESSMENT', 'REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "description" VARCHAR(300) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "employee_id" UUID,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(6),
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_units" (
    "user_role_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,

    CONSTRAINT "user_role_units_pkey" PRIMARY KEY ("user_role_id","unit_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "user_id" UUID NOT NULL,
    "csrf_token_hash" VARCHAR(128) NOT NULL,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "ip" VARCHAR(64),
    "success" BOOLEAN NOT NULL,
    "reason" VARCHAR(100),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizational_units" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "short_name" VARCHAR(100),
    "type" "UnitType" NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "effective_from" DATE,
    "effective_to" DATE,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "organizational_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "level" INTEGER NOT NULL,
    "is_leadership" BOOLEAN NOT NULL,
    "kpi_profile" "KpiProfile" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_positions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "group" "JobPositionGroup" NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_provisional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "date_of_birth" DATE,
    "email" VARCHAR(200),
    "phone" VARCHAR(30),
    "party_position" VARCHAR(200),
    "gov_position" VARCHAR(200),
    "union_position" VARCHAR(200),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'WORKING',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_assignments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "job_position_id" UUID,
    "manager_employee_id" UUID,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "duties" TEXT,
    "decision_ref" VARCHAR(200),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_supervisions" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_supervisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_periods" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "PeriodType" NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "parent_id" UUID,
    "status" "PeriodStatus" NOT NULL DEFAULT 'PLANNING',
    "is_rated" BOOLEAN NOT NULL DEFAULT true,
    "self_deadline" DATE,
    "review_deadline" DATE,
    "submit_deadline" DATE,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "evaluation_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "actor_ip" VARCHAR(64),
    "request_id" VARCHAR(64),
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "result" "AuditResult" NOT NULL,
    "changes" JSONB,
    "prev_hash" VARCHAR(128),
    "hash" VARCHAR(128),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_scope_type_key" ON "user_roles"("user_id", "role_id", "scope_type");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_username_at_idx" ON "login_attempts"("username", "at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_at_idx" ON "login_attempts"("ip", "at");

-- CreateIndex
CREATE UNIQUE INDEX "organizational_units_code_key" ON "organizational_units"("code");

-- CreateIndex
CREATE INDEX "organizational_units_parent_id_idx" ON "organizational_units"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "job_positions_code_key" ON "job_positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE INDEX "employees_full_name_idx" ON "employees"("full_name");

-- CreateIndex
CREATE INDEX "employee_assignments_employee_id_idx" ON "employee_assignments"("employee_id");

-- CreateIndex
CREATE INDEX "employee_assignments_unit_id_idx" ON "employee_assignments"("unit_id");

-- CreateIndex
CREATE INDEX "employee_assignments_manager_employee_id_idx" ON "employee_assignments"("manager_employee_id");

-- CreateIndex
CREATE INDEX "unit_supervisions_unit_id_idx" ON "unit_supervisions"("unit_id");

-- CreateIndex
CREATE INDEX "unit_supervisions_employee_id_idx" ON "unit_supervisions"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_periods_code_key" ON "evaluation_periods"("code");

-- CreateIndex
CREATE INDEX "evaluation_periods_parent_id_idx" ON "evaluation_periods"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_periods_type_year_seq_key" ON "evaluation_periods"("type", "year", "seq");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_units" ADD CONSTRAINT "user_role_units_user_role_id_fkey" FOREIGN KEY ("user_role_id") REFERENCES "user_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_units" ADD CONSTRAINT "user_role_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizational_units" ADD CONSTRAINT "organizational_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_job_position_id_fkey" FOREIGN KEY ("job_position_id") REFERENCES "job_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_manager_employee_id_fkey" FOREIGN KEY ("manager_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_supervisions" ADD CONSTRAINT "unit_supervisions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_supervisions" ADD CONSTRAINT "unit_supervisions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- RÀNG BUỘC BỔ SUNG (viết tay) — Prisma schema không biểu diễn được CHECK/trigger.
-- Thiết kế: docs/03-database.md §3.1. Không thêm partial index ở đây để tránh
-- Prisma phát hiện "drift" và đòi reset DB.
-- =====================================================================

-- Chức vụ có 5 cấp theo sơ đồ phân công của Ban
ALTER TABLE "positions"
  ADD CONSTRAINT "positions_level_check" CHECK ("level" BETWEEN 1 AND 5);

-- Khoảng thời gian hợp lệ
ALTER TABLE "employee_assignments"
  ADD CONSTRAINT "employee_assignments_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "unit_supervisions"
  ADD CONSTRAINT "unit_supervisions_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "evaluation_periods"
  ADD CONSTRAINT "evaluation_periods_dates_check" CHECK ("end_date" >= "start_date");
ALTER TABLE "evaluation_periods"
  ADD CONSTRAINT "evaluation_periods_seq_check" CHECK ("seq" >= 1);
ALTER TABLE "organizational_units"
  ADD CONSTRAINT "organizational_units_not_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "users"
  ADD CONSTRAINT "users_failed_login_count_check" CHECK ("failed_login_count" >= 0);

-- Mỗi cán bộ chỉ có tối đa 1 phân công CHÍNH đang hiệu lực (end_date IS NULL)
CREATE OR REPLACE FUNCTION enforce_single_active_primary_assignment() RETURNS trigger AS $$
BEGIN
  IF NEW."is_primary" AND NEW."end_date" IS NULL THEN
    PERFORM 1 FROM "employee_assignments"
      WHERE "employee_id" = NEW."employee_id"
        AND "is_primary"
        AND "end_date" IS NULL
        AND "id" <> NEW."id";
    IF FOUND THEN
      RAISE EXCEPTION 'Cán bộ % đã có phân công chính đang hiệu lực; cần kết thúc phân công cũ trước', NEW."employee_id"
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "employee_assignments_single_active_primary"
  BEFORE INSERT OR UPDATE ON "employee_assignments"
  FOR EACH ROW EXECUTE FUNCTION enforce_single_active_primary_assignment();

-- Nhật ký kiểm toán chỉ được GHI THÊM: chặn UPDATE/DELETE/TRUNCATE (docs/10 R7)
CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs là append-only: không được % ', TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();
