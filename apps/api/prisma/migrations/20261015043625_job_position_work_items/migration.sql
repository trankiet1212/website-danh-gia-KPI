-- CreateTable
CREATE TABLE "job_position_work_items" (
    "job_position_id" UUID NOT NULL,
    "item_code" VARCHAR(50) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_position_work_items_pkey" PRIMARY KEY ("job_position_id","item_code")
);

-- CreateIndex
CREATE INDEX "job_position_work_items_item_code_idx" ON "job_position_work_items"("item_code");

-- AddForeignKey
ALTER TABLE "job_position_work_items" ADD CONSTRAINT "job_position_work_items_job_position_id_fkey" FOREIGN KEY ("job_position_id") REFERENCES "job_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
