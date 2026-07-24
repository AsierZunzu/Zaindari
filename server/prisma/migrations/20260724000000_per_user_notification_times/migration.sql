-- The reminder time moves from the schedule tables onto each user. A plant may
-- still pin a time for everyone; a task type no longer can.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "notification_hour" INTEGER NOT NULL DEFAULT 9,
                    ADD COLUMN "notification_minute" INTEGER NOT NULL DEFAULT 0;

-- Existing installs carried a per-task-type hour on the defaults. Watering's is
-- the closest thing to an install-wide preference, so it seeds everyone's base
-- time rather than being silently dropped.
UPDATE "users" SET
  "notification_hour" = COALESCE((SELECT "hour" FROM "default_schedules" WHERE "task_type" = 'watering'), 9),
  "notification_minute" = COALESCE((SELECT "minute" FROM "default_schedules" WHERE "task_type" = 'watering'), 0);

-- CreateTable
CREATE TABLE "user_notification_times" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_times_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_times_user_id_task_type_key" ON "user_notification_times"("user_id", "task_type");

-- AddForeignKey
ALTER TABLE "user_notification_times" ADD CONSTRAINT "user_notification_times_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "task_notifications" (
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_notifications_pkey" PRIMARY KEY ("task_id","user_id")
);

-- AddForeignKey
ALTER TABLE "task_notifications" ADD CONSTRAINT "task_notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_notifications" ADD CONSTRAINT "task_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tasks that already exist were notified under the old create-time rule. Mark
-- every current collaborator as already reminded, or the first cron tick after
-- deploying would push all of them at once.
INSERT INTO "task_notifications" ("task_id", "user_id", "notified_at")
SELECT t."id", p."owner_id", t."created_at"
FROM "tasks" t
JOIN "plants" p ON p."id" = t."plant_id"
WHERE t."status" IN ('pending', 'snoozed')
ON CONFLICT DO NOTHING;

INSERT INTO "task_notifications" ("task_id", "user_id", "notified_at")
SELECT t."id", s."user_id", t."created_at"
FROM "tasks" t
JOIN "plant_shares" s ON s."plant_id" = t."plant_id"
WHERE t."status" IN ('pending', 'snoozed')
ON CONFLICT DO NOTHING;

-- AlterTable: the reminder time is no longer a property of the task type.
ALTER TABLE "default_schedules" DROP COLUMN "hour",
                                DROP COLUMN "minute";

-- AlterTable: a plant may still pin a time for all of its collaborators.
ALTER TABLE "plant_schedules" ALTER COLUMN "hour" DROP NOT NULL,
                              ALTER COLUMN "minute" DROP NOT NULL,
                              ALTER COLUMN "minute" DROP DEFAULT;
