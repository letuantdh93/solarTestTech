-- Extensions for similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ToleranceType" AS ENUM ('ABSOLUTE', 'RELATIVE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResultVisibility" AS ENUM ('HIDDEN', 'SCORE_ONLY', 'DETAILED');

-- CreateEnum
CREATE TYPE "ExplanationVisibility" AS ENUM ('NEVER', 'AFTER_SUBMIT', 'AFTER_CLOSE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "department" TEXT,
    "position" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group_members" (
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "author_categories" (
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "author_categories_pkey" PRIMARY KEY ("user_id","category_id")
);

-- CreateTable
CREATE TABLE "question_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "category_id" TEXT NOT NULL,
    "subcategory_id" TEXT,
    "difficulty" INTEGER NOT NULL,
    "calc_complexity" INTEGER NOT NULL DEFAULT 0,
    "is_calculation" BOOLEAN NOT NULL DEFAULT false,
    "is_scenario" BOOLEAN NOT NULL DEFAULT false,
    "assumptions" TEXT,
    "explanation" TEXT,
    "calc_method" TEXT,
    "concept_key" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "numeric_answer" DECIMAL(20,6),
    "numeric_unit" TEXT,
    "numeric_tolerance" DECIMAL(20,6),
    "tolerance_type" "ToleranceType",
    "numeric_decimals" INTEGER,
    "calc_spec" JSONB,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "author_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "review_comment" TEXT,
    "approved_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "numeric_value" DECIMAL(20,6),
    "rationale" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_media" (
    "id" TEXT NOT NULL,
    "question_id" TEXT,
    "stored_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_references" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "edition" TEXT,
    "jurisdiction" TEXT,
    "clause" TEXT,
    "title" TEXT,
    "note" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "question_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_revisions" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "change_note" TEXT,
    "changed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_review_logs" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "from_status" "QuestionStatus" NOT NULL,
    "to_status" "QuestionStatus" NOT NULL,
    "comment" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_blueprints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "passing_score" DECIMAL(5,2) NOT NULL DEFAULT 70,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examinations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_audience" TEXT,
    "exam_category" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "passing_score" DECIMAL(5,2) NOT NULL,
    "randomize_questions" BOOLEAN NOT NULL DEFAULT true,
    "randomize_options" BOOLEAN NOT NULL DEFAULT true,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "result_visibility" "ResultVisibility" NOT NULL DEFAULT 'DETAILED',
    "explanation_visibility" "ExplanationVisibility" NOT NULL DEFAULT 'AFTER_SUBMIT',
    "generation_config" JSONB,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "blueprint_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_questions" (
    "id" TEXT NOT NULL,
    "examination_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "points" DECIMAL(6,2) NOT NULL DEFAULT 1,

    CONSTRAINT "examination_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_assignments" (
    "id" TEXT NOT NULL,
    "examination_id" TEXT NOT NULL,
    "user_id" TEXT,
    "group_id" TEXT,
    "assigned_by_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examination_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_attempts" (
    "id" TEXT NOT NULL,
    "examination_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "ip" TEXT,
    "user_agent" TEXT,
    "exam_snapshot" JSONB NOT NULL,

    CONSTRAINT "examination_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_questions" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_version" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "points" DECIMAL(6,2) NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "attempt_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_answers" (
    "id" TEXT NOT NULL,
    "attempt_question_id" TEXT NOT NULL,
    "selected_option_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "numeric_value" DECIMAL(20,6),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "is_correct" BOOLEAN,
    "score" DECIMAL(6,2),
    "answered_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_results" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "examination_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score_percent" DECIMAL(5,2) NOT NULL,
    "points_earned" DECIMAL(8,2) NOT NULL,
    "points_total" DECIMAL(8,2) NOT NULL,
    "correct_count" INTEGER NOT NULL,
    "incorrect_count" INTEGER NOT NULL,
    "unanswered_count" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "by_category" JSONB NOT NULL,
    "by_difficulty" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examination_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" "AiJobStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_question_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ai_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_groups_name_key" ON "user_groups"("name");

-- CreateIndex
CREATE INDEX "user_group_members_user_id_idx" ON "user_group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_categories_code_key" ON "question_categories"("code");

-- CreateIndex
CREATE INDEX "question_categories_parent_id_idx" ON "question_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_code_key" ON "questions"("code");

-- CreateIndex
CREATE INDEX "questions_category_id_status_difficulty_idx" ON "questions"("category_id", "status", "difficulty");

-- CreateIndex
CREATE INDEX "questions_subcategory_id_idx" ON "questions"("subcategory_id");

-- CreateIndex
CREATE INDEX "questions_author_id_idx" ON "questions"("author_id");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "questions_concept_key_idx" ON "questions"("concept_key");

-- CreateIndex
CREATE INDEX "questions_updated_at_idx" ON "questions"("updated_at");

-- CreateIndex
CREATE INDEX "question_options_question_id_idx" ON "question_options"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_media_stored_name_key" ON "question_media"("stored_name");

-- CreateIndex
CREATE INDEX "question_media_question_id_idx" ON "question_media"("question_id");

-- CreateIndex
CREATE INDEX "question_references_question_id_idx" ON "question_references"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_revisions_question_id_version_key" ON "question_revisions"("question_id", "version");

-- CreateIndex
CREATE INDEX "question_review_logs_question_id_created_at_idx" ON "question_review_logs"("question_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "examinations_code_key" ON "examinations"("code");

-- CreateIndex
CREATE INDEX "examinations_status_idx" ON "examinations"("status");

-- CreateIndex
CREATE INDEX "examination_questions_question_id_idx" ON "examination_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_questions_examination_id_question_id_key" ON "examination_questions"("examination_id", "question_id");

-- CreateIndex
CREATE INDEX "examination_assignments_user_id_idx" ON "examination_assignments"("user_id");

-- CreateIndex
CREATE INDEX "examination_assignments_group_id_idx" ON "examination_assignments"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_assignments_examination_id_user_id_key" ON "examination_assignments"("examination_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_assignments_examination_id_group_id_key" ON "examination_assignments"("examination_id", "group_id");

-- CreateIndex
CREATE INDEX "examination_attempts_user_id_status_idx" ON "examination_attempts"("user_id", "status");

-- CreateIndex
CREATE INDEX "examination_attempts_status_deadline_at_idx" ON "examination_attempts"("status", "deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "examination_attempts_examination_id_user_id_attempt_no_key" ON "examination_attempts"("examination_id", "user_id", "attempt_no");

-- CreateIndex
CREATE INDEX "attempt_questions_attempt_id_idx" ON "attempt_questions"("attempt_id");

-- CreateIndex
CREATE INDEX "attempt_questions_question_id_idx" ON "attempt_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_sort_order_key" ON "attempt_questions"("attempt_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_answers_attempt_question_id_key" ON "candidate_answers"("attempt_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_results_attempt_id_key" ON "examination_results"("attempt_id");

-- CreateIndex
CREATE INDEX "examination_results_examination_id_score_percent_idx" ON "examination_results"("examination_id", "score_percent");

-- CreateIndex
CREATE INDEX "examination_results_user_id_created_at_idx" ON "examination_results"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "ai_generation_jobs_user_id_created_at_idx" ON "ai_generation_jobs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_categories" ADD CONSTRAINT "author_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_categories" ADD CONSTRAINT "author_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "question_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_categories" ADD CONSTRAINT "question_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "question_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "question_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "question_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_references" ADD CONSTRAINT "question_references_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_review_logs" ADD CONSTRAINT "question_review_logs_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_review_logs" ADD CONSTRAINT "question_review_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "exam_blueprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_assignments" ADD CONSTRAINT "examination_assignments_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_assignments" ADD CONSTRAINT "examination_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_assignments" ADD CONSTRAINT "examination_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_assignments" ADD CONSTRAINT "examination_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_attempts" ADD CONSTRAINT "examination_attempts_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_attempts" ADD CONSTRAINT "examination_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "examination_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_answers" ADD CONSTRAINT "candidate_answers_attempt_question_id_fkey" FOREIGN KEY ("attempt_question_id") REFERENCES "attempt_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_results" ADD CONSTRAINT "examination_results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "examination_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_results" ADD CONSTRAINT "examination_results_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_results" ADD CONSTRAINT "examination_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written additions ──
-- Trigram indexes for keyword search and near-duplicate detection
CREATE INDEX "questions_content_trgm_idx" ON "questions" USING gin ("content" gin_trgm_ops);
CREATE INDEX "questions_title_trgm_idx" ON "questions" USING gin ("title" gin_trgm_ops);
CREATE INDEX "questions_tags_gin_idx" ON "questions" USING gin ("tags");
-- Integrity guards
ALTER TABLE "questions" ADD CONSTRAINT "questions_difficulty_chk" CHECK ("difficulty" BETWEEN 1 AND 4);
ALTER TABLE "questions" ADD CONSTRAINT "questions_calc_complexity_chk" CHECK ("calc_complexity" BETWEEN 0 AND 3);
ALTER TABLE "examination_assignments" ADD CONSTRAINT "assignment_target_chk" CHECK (("user_id" IS NOT NULL) <> ("group_id" IS NOT NULL));
-- At most one in-progress attempt per candidate and exam
CREATE UNIQUE INDEX "attempt_one_in_progress_idx" ON "examination_attempts" ("examination_id", "user_id") WHERE "status" = 'IN_PROGRESS';
