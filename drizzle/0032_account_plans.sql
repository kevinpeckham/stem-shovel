ALTER TABLE `account` ADD `plan` text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `account` ADD `lifetime_free` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `account` ADD `is_founder` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `account` SET `is_founder` = true WHERE `id` IN (SELECT `id` FROM `account` ORDER BY `created_at` ASC LIMIT 20);
