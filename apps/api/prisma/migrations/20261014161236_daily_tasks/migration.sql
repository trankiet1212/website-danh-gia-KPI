-- CreateEnum
CREATE TYPE "DailyReportStatus" AS ENUM ('PENDING', 'DONE', 'NOT_DONE');

-- CreateEnum
CREATE TYPE "DailyTaskResult" AS ENUM ('COMPLETED', 'NOT_COMPLETED');

-- CreateEnum
CREATE TYPE "DailyTaskQuality" AS ENUM ('MEETS', 'REWORK');

-- CreateEnum
CREATE TYPE "DailyTaskTimeliness" AS ENUM ('ON_TIME', 'LATE');

-- CreateTable
CREATE TABLE "daily_tasks" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "report_status" "DailyReportStatus" NOT NULL DEFAULT 'PENDING',
    "report_note" TEXT,
    "reported_at" TIMESTAMPTZ(6),
    "result" "DailyTaskResult",
    "quality" "DailyTaskQuality",
    "timeliness" "DailyTaskTimeliness",
    "eval_comment" TEXT,
    "evaluated_by" UUID,
    "evaluated_at" TIMESTAMPTZ(6),
    "assigned_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_tasks_employee_id_work_date_idx" ON "daily_tasks"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "daily_tasks_unit_id_work_date_idx" ON "daily_tasks"("unit_id", "work_date");

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ràng buộc nhất quán (viết tay — docs/03 "Giao việc hằng ngày")
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_title_check" CHECK (char_length(btrim("title")) > 0);
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_evaluation_check" CHECK (
  ("result" IS NULL AND "evaluated_at" IS NULL AND "quality" IS NULL AND "timeliness" IS NULL)
  OR ("result" = 'COMPLETED' AND "evaluated_at" IS NOT NULL AND "quality" IS NOT NULL AND "timeliness" IS NOT NULL)
  OR ("result" = 'NOT_COMPLETED' AND "evaluated_at" IS NOT NULL AND "quality" IS NULL AND "timeliness" IS NULL)
);
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_report_check" CHECK (("report_status" = 'PENDING') = ("reported_at" IS NULL));
