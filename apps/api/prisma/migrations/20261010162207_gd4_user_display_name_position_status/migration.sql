-- AlterTable
ALTER TABLE "job_positions" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "display_name" VARCHAR(200);
