-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CriteriaItemKind" AS ENUM ('GENERAL_GROUP', 'GENERAL_ITEM', 'AXIS', 'AXIS_INDICATOR');

-- CreateEnum
CREATE TYPE "ScoringMethod" AS ENUM ('PASS_FAIL', 'MANUAL_SCORE', 'QUALITATIVE_LEVEL', 'TARGET_RATIO', 'KPI_COMPOSITE', 'WEIGHTED_INDICATORS');

-- CreateEnum
CREATE TYPE "MeasureDirection" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "MeasureType" AS ENUM ('NUMBER', 'PERCENT', 'BOOLEAN', 'MILESTONE');

-- CreateEnum
CREATE TYPE "KeyResultKind" AS ENUM ('KR', 'KPI');

-- CreateEnum
CREATE TYPE "SubjectKind" AS ENUM ('EMPLOYEE', 'UNIT');

-- CreateEnum
CREATE TYPE "ObjectiveStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVIEWED', 'APPROVED', 'RETURNED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalculationKind" AS ENUM ('TRIAL', 'SELF', 'REVIEW', 'APPROVAL');

-- CreateTable
CREATE TABLE "rule_sets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_set_versions" (
    "id" UUID NOT NULL,
    "rule_set_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "ConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "legal_basis" TEXT NOT NULL,
    "source_refs" JSONB NOT NULL DEFAULT '[]',
    "effective_from" DATE,
    "checksum" VARCHAR(64) NOT NULL,
    "created_by" UUID,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirm_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rule_set_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_catalogs" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_catalog_versions" (
    "id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "standard_points" DECIMAL(10,2) NOT NULL,
    "legal_basis" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approve_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "work_catalog_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_catalog_items" (
    "id" UUID NOT NULL,
    "catalog_version_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "group_code" VARCHAR(10) NOT NULL,
    "name" TEXT NOT NULL,
    "product" VARCHAR(500),
    "complexity_level" INTEGER NOT NULL,
    "max_hours_text" VARCHAR(50),
    "points" DECIMAL(10,2) NOT NULL,
    "coefficient" DECIMAL(12,6) NOT NULL,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria_sets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "target_kind" "SubjectKind" NOT NULL DEFAULT 'EMPLOYEE',
    "kpi_profile" "KpiProfile" NOT NULL,
    "job_position_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "criteria_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria_versions" (
    "id" UUID NOT NULL,
    "criteria_set_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "period_types" "PeriodType"[],
    "general_max" DECIMAL(8,2) NOT NULL,
    "result_max" DECIMAL(8,2) NOT NULL,
    "rule_set_version_id" UUID,
    "work_catalog_version_id" UUID,
    "change_note" TEXT,
    "created_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approve_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "criteria_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria_items" (
    "id" UUID NOT NULL,
    "criteria_version_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "CriteriaItemKind" NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_points" DECIMAL(8,2) NOT NULL,
    "weight" DECIMAL(8,4),
    "scoring_method" "ScoringMethod",
    "measure_unit" VARCHAR(100),
    "direction" "MeasureDirection",
    "target" DECIMAL(18,4),
    "baseline" DECIMAL(18,4),
    "allow_not_applicable" BOOLEAN NOT NULL DEFAULT false,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,
    "data_source" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "criteria_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectives" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "owner_kind" "SubjectKind" NOT NULL,
    "owner_employee_id" UUID,
    "owner_unit_id" UUID,
    "parent_objective_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_results" (
    "id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "KeyResultKind" NOT NULL DEFAULT 'KR',
    "measure_type" "MeasureType" NOT NULL,
    "direction" "MeasureDirection" NOT NULL DEFAULT 'INCREASE',
    "measure_unit" VARCHAR(100),
    "baseline" DECIMAL(18,4),
    "target" DECIMAL(18,4) NOT NULL,
    "current_value" DECIMAL(18,4),
    "weight" DECIMAL(8,4),
    "due_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "key_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_result_checkins" (
    "id" UUID NOT NULL,
    "key_result_id" UUID NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "note" TEXT,
    "checked_by" UUID,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_result_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_records" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "subject_kind" "SubjectKind" NOT NULL DEFAULT 'EMPLOYEE',
    "subject_employee_id" UUID,
    "unit_id" UUID NOT NULL,
    "assignment_snapshot" JSONB NOT NULL,
    "kpi_profile" "KpiProfile" NOT NULL,
    "criteria_version_id" UUID NOT NULL,
    "rule_set_version_id" UUID NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "self_total" DECIMAL(10,4),
    "review_total" DECIMAL(10,4),
    "approved_total" DECIMAL(10,4),
    "self_rating" VARCHAR(50),
    "review_rating" VARCHAR(50),
    "approved_rating" VARCHAR(50),
    "rating_override_reason" TEXT,
    "review_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "evaluation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_items" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "criteria_item_id" UUID NOT NULL,
    "self_input" JSONB,
    "review_input" JSONB,
    "self_note" TEXT,
    "review_note" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_calculations" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "kind" "CalculationKind" NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "engine_version" VARCHAR(20) NOT NULL,
    "rule_set_version_id" UUID NOT NULL,
    "rule_set_checksum" VARCHAR(64) NOT NULL,
    "criteria_version_id" UUID NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_history" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30),
    "actor_user_id" UUID,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rule_sets_code_key" ON "rule_sets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rule_set_versions_rule_set_id_version_no_key" ON "rule_set_versions"("rule_set_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "work_catalogs_code_key" ON "work_catalogs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "work_catalog_versions_catalog_id_version_no_key" ON "work_catalog_versions"("catalog_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "work_catalog_items_catalog_version_id_code_key" ON "work_catalog_items"("catalog_version_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_sets_code_key" ON "criteria_sets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_versions_criteria_set_id_version_no_key" ON "criteria_versions"("criteria_set_id", "version_no");

-- CreateIndex
CREATE INDEX "criteria_items_parent_id_idx" ON "criteria_items"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_items_criteria_version_id_code_key" ON "criteria_items"("criteria_version_id", "code");

-- CreateIndex
CREATE INDEX "objectives_owner_employee_id_idx" ON "objectives"("owner_employee_id");

-- CreateIndex
CREATE INDEX "objectives_owner_unit_id_idx" ON "objectives"("owner_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "objectives_period_id_code_key" ON "objectives"("period_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "key_results_objective_id_code_key" ON "key_results"("objective_id", "code");

-- CreateIndex
CREATE INDEX "key_result_checkins_key_result_id_checked_at_idx" ON "key_result_checkins"("key_result_id", "checked_at");

-- CreateIndex
CREATE INDEX "evaluation_records_unit_id_idx" ON "evaluation_records"("unit_id");

-- CreateIndex
CREATE INDEX "evaluation_records_status_idx" ON "evaluation_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_records_period_id_subject_employee_id_key" ON "evaluation_records"("period_id", "subject_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_items_evaluation_id_criteria_item_id_key" ON "evaluation_items"("evaluation_id", "criteria_item_id");

-- CreateIndex
CREATE INDEX "evaluation_calculations_evaluation_id_kind_created_at_idx" ON "evaluation_calculations"("evaluation_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "evaluation_history_evaluation_id_created_at_idx" ON "evaluation_history"("evaluation_id", "created_at");

-- AddForeignKey
ALTER TABLE "rule_set_versions" ADD CONSTRAINT "rule_set_versions_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_catalog_versions" ADD CONSTRAINT "work_catalog_versions_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "work_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_catalog_items" ADD CONSTRAINT "work_catalog_items_catalog_version_id_fkey" FOREIGN KEY ("catalog_version_id") REFERENCES "work_catalog_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_sets" ADD CONSTRAINT "criteria_sets_job_position_id_fkey" FOREIGN KEY ("job_position_id") REFERENCES "job_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_versions" ADD CONSTRAINT "criteria_versions_criteria_set_id_fkey" FOREIGN KEY ("criteria_set_id") REFERENCES "criteria_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_versions" ADD CONSTRAINT "criteria_versions_rule_set_version_id_fkey" FOREIGN KEY ("rule_set_version_id") REFERENCES "rule_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_versions" ADD CONSTRAINT "criteria_versions_work_catalog_version_id_fkey" FOREIGN KEY ("work_catalog_version_id") REFERENCES "work_catalog_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_items" ADD CONSTRAINT "criteria_items_criteria_version_id_fkey" FOREIGN KEY ("criteria_version_id") REFERENCES "criteria_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_items" ADD CONSTRAINT "criteria_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "criteria_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_employee_id_fkey" FOREIGN KEY ("owner_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_unit_id_fkey" FOREIGN KEY ("owner_unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_parent_objective_id_fkey" FOREIGN KEY ("parent_objective_id") REFERENCES "objectives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_result_checkins" ADD CONSTRAINT "key_result_checkins_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "key_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_records" ADD CONSTRAINT "evaluation_records_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_records" ADD CONSTRAINT "evaluation_records_subject_employee_id_fkey" FOREIGN KEY ("subject_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_records" ADD CONSTRAINT "evaluation_records_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_records" ADD CONSTRAINT "evaluation_records_criteria_version_id_fkey" FOREIGN KEY ("criteria_version_id") REFERENCES "criteria_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_records" ADD CONSTRAINT "evaluation_records_rule_set_version_id_fkey" FOREIGN KEY ("rule_set_version_id") REFERENCES "rule_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_criteria_item_id_fkey" FOREIGN KEY ("criteria_item_id") REFERENCES "criteria_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_calculations" ADD CONSTRAINT "evaluation_calculations_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_history" ADD CONSTRAINT "evaluation_history_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- RÀNG BUỘC BỔ SUNG GĐ5 (viết tay) — bảo vệ dữ liệu đã xác nhận/phê duyệt ở mức database.
-- docs/07-tieu-chi-va-tinh-diem.md, docs/06-quy-trinh-trang-thai.md
-- =====================================================================

ALTER TABLE "rule_set_versions" ADD CONSTRAINT "rule_set_versions_version_no_check" CHECK ("version_no" >= 1);
ALTER TABLE "criteria_versions" ADD CONSTRAINT "criteria_versions_version_no_check" CHECK ("version_no" >= 1);
ALTER TABLE "criteria_versions" ADD CONSTRAINT "criteria_versions_points_check" CHECK ("general_max" >= 0 AND "result_max" >= 0);
ALTER TABLE "criteria_items" ADD CONSTRAINT "criteria_items_points_check" CHECK ("max_points" >= 0);
ALTER TABLE "criteria_items" ADD CONSTRAINT "criteria_items_weight_check" CHECK ("weight" IS NULL OR "weight" > 0);
ALTER TABLE "work_catalog_items" ADD CONSTRAINT "work_catalog_items_points_check" CHECK ("points" > 0 AND "coefficient" > 0);
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_check" CHECK (
  ("owner_kind" = 'EMPLOYEE' AND "owner_employee_id" IS NOT NULL AND "owner_unit_id" IS NULL) OR
  ("owner_kind" = 'UNIT' AND "owner_unit_id" IS NOT NULL AND "owner_employee_id" IS NULL)
);
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_weight_check" CHECK ("weight" IS NULL OR ("weight" > 0 AND "weight" <= 100));
ALTER TABLE "evaluation_records" ADD CONSTRAINT "evaluation_records_subject_check" CHECK (
  ("subject_kind" = 'EMPLOYEE' AND "subject_employee_id" IS NOT NULL) OR ("subject_kind" = 'UNIT')
);
ALTER TABLE "evaluation_records" ADD CONSTRAINT "evaluation_records_revision_check" CHECK ("revision_no" >= 1);

-- ---------------------------------------------------------------------
-- Bộ quy tắc đã XÁC NHẬN: không sửa nội dung, không xóa; chỉ được chuyển sang RETIRED.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rule_set_versions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Chỉ được xóa phiên bản bộ quy tắc ở trạng thái bản nháp' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('CONFIRMED', 'RETIRED') AND (
       NEW."config" IS DISTINCT FROM OLD."config" OR
       NEW."legal_basis" IS DISTINCT FROM OLD."legal_basis" OR
       NEW."source_refs" IS DISTINCT FROM OLD."source_refs" OR
       NEW."checksum" IS DISTINCT FROM OLD."checksum" OR
       NEW."confirmed_by" IS DISTINCT FROM OLD."confirmed_by" OR
       NEW."confirmed_at" IS DISTINCT FROM OLD."confirmed_at" OR
       (OLD."status" = 'RETIRED' AND NEW."status" <> 'RETIRED') OR
       (OLD."status" = 'CONFIRMED' AND NEW."status" NOT IN ('CONFIRMED', 'RETIRED'))
     ) THEN
    RAISE EXCEPTION 'Phiên bản bộ quy tắc đã xác nhận là bất biến — hãy tạo phiên bản mới' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rule_set_versions_immutable"
  BEFORE UPDATE OR DELETE ON "rule_set_versions"
  FOR EACH ROW EXECUTE FUNCTION rule_set_versions_guard();

-- ---------------------------------------------------------------------
-- Bộ tiêu chí / danh mục SP-CV đã PHÊ DUYỆT: không sửa cấu trúc, không sửa mục.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION criteria_versions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Chỉ được xóa phiên bản bộ tiêu chí ở trạng thái bản nháp' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('APPROVED', 'RETIRED') AND (
       NEW."general_max" IS DISTINCT FROM OLD."general_max" OR
       NEW."result_max" IS DISTINCT FROM OLD."result_max" OR
       NEW."period_types" IS DISTINCT FROM OLD."period_types" OR
       NEW."rule_set_version_id" IS DISTINCT FROM OLD."rule_set_version_id" OR
       NEW."work_catalog_version_id" IS DISTINCT FROM OLD."work_catalog_version_id" OR
       NEW."approved_by" IS DISTINCT FROM OLD."approved_by" OR
       (OLD."status" = 'RETIRED' AND NEW."status" <> 'RETIRED') OR
       (OLD."status" = 'APPROVED' AND NEW."status" NOT IN ('APPROVED', 'RETIRED'))
     ) THEN
    RAISE EXCEPTION 'Phiên bản bộ tiêu chí đã phê duyệt là bất biến — hãy tạo phiên bản mới' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "criteria_versions_immutable"
  BEFORE UPDATE OR DELETE ON "criteria_versions"
  FOR EACH ROW EXECUTE FUNCTION criteria_versions_guard();

CREATE OR REPLACE FUNCTION criteria_items_guard() RETURNS trigger AS $$
DECLARE
  v_status text;
BEGIN
  SELECT "status" INTO v_status FROM "criteria_versions"
    WHERE "id" = COALESCE(NEW."criteria_version_id", OLD."criteria_version_id");
  IF v_status IS NOT NULL AND v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Chỉ được sửa mục tiêu chí khi phiên bản bộ tiêu chí là bản nháp' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "criteria_items_draft_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "criteria_items"
  FOR EACH ROW EXECUTE FUNCTION criteria_items_guard();

CREATE OR REPLACE FUNCTION work_catalog_items_guard() RETURNS trigger AS $$
DECLARE
  v_status text;
BEGIN
  SELECT "status" INTO v_status FROM "work_catalog_versions"
    WHERE "id" = COALESCE(NEW."catalog_version_id", OLD."catalog_version_id");
  IF v_status IS NOT NULL AND v_status IN ('APPROVED', 'RETIRED') THEN
    RAISE EXCEPTION 'Danh mục sản phẩm/công việc đã phê duyệt là bất biến' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "work_catalog_items_locked"
  BEFORE INSERT OR UPDATE OR DELETE ON "work_catalog_items"
  FOR EACH ROW EXECUTE FUNCTION work_catalog_items_guard();

-- ---------------------------------------------------------------------
-- Hồ sơ đánh giá ĐÃ PHÊ DUYỆT: khóa. Chỉ được chuyển sang REOPENED (quy trình mở lại).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evaluation_records_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" NOT IN ('DRAFT', 'CANCELLED') OR EXISTS (
         SELECT 1 FROM "evaluation_calculations" c WHERE c."evaluation_id" = OLD."id" AND c."kind" <> 'TRIAL') THEN
      RAISE EXCEPTION 'Không được xóa hồ sơ đánh giá đã phát sinh kết quả' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" <> 'REOPENED' THEN
    RAISE EXCEPTION 'Hồ sơ đánh giá đã phê duyệt bị khóa — phải thực hiện quy trình mở lại' USING ERRCODE = '42501';
  END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" = 'REOPENED' AND NEW."revision_no" <> OLD."revision_no" + 1 THEN
    RAISE EXCEPTION 'Mở lại hồ sơ phải tăng số lần điều chỉnh (revision)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evaluation_records_lock"
  BEFORE UPDATE OR DELETE ON "evaluation_records"
  FOR EACH ROW EXECUTE FUNCTION evaluation_records_guard();

CREATE OR REPLACE FUNCTION evaluation_items_guard() RETURNS trigger AS $$
DECLARE
  v_status text;
BEGIN
  SELECT "status" INTO v_status FROM "evaluation_records"
    WHERE "id" = COALESCE(NEW."evaluation_id", OLD."evaluation_id");
  IF v_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Hồ sơ đánh giá đã phê duyệt bị khóa — không được sửa dữ liệu chấm' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evaluation_items_lock"
  BEFORE INSERT OR UPDATE OR DELETE ON "evaluation_items"
  FOR EACH ROW EXECUTE FUNCTION evaluation_items_guard();

-- ---------------------------------------------------------------------
-- Ảnh chụp tính điểm, lịch sử hồ sơ, lịch sử cập nhật KR: CHỈ GHI THÊM.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION append_only_block() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Bảng % chỉ được ghi thêm: không được %', TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evaluation_calculations_append_only"
  BEFORE UPDATE OR DELETE ON "evaluation_calculations"
  FOR EACH ROW EXECUTE FUNCTION append_only_block();

CREATE TRIGGER "evaluation_history_append_only"
  BEFORE UPDATE OR DELETE ON "evaluation_history"
  FOR EACH ROW EXECUTE FUNCTION append_only_block();

CREATE TRIGGER "key_result_checkins_append_only"
  BEFORE UPDATE OR DELETE ON "key_result_checkins"
  FOR EACH ROW EXECUTE FUNCTION append_only_block();
