-- Guest (no-account) exam access: candidates enter name / phone / department.
-- NOTE: generated with `prisma migrate diff`; the diff's DROP statements for the
-- hand-written trigram/GIN indexes from the init migration were removed on purpose.

-- Exams can be opened to candidates without login (default: on)
ALTER TABLE "examinations" ADD COLUMN "public_access" BOOLEAN NOT NULL DEFAULT true;
DROP INDEX "examinations_status_idx";
CREATE INDEX "examinations_status_public_access_idx" ON "examinations"("status", "public_access");

-- Guest candidates are identified by their normalised phone number
ALTER TABLE "users" ADD COLUMN "is_guest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "phone" TEXT;
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- Guest sessions are scoped to the attempts they started
ALTER TABLE "sessions" ADD COLUMN "is_guest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "examination_attempts" ADD COLUMN "access_session_id" TEXT;
CREATE INDEX "examination_attempts_access_session_id_idx" ON "examination_attempts"("access_session_id");
