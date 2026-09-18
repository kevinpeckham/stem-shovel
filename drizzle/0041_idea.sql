CREATE TABLE `idea` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_by` text,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idea_account_idx` ON `idea` (`account_id`);--> statement-breakpoint
CREATE INDEX `idea_created_by_idx` ON `idea` (`created_by`);--> statement-breakpoint
ALTER TABLE `recording` ADD `idea_id` text REFERENCES idea(id);--> statement-breakpoint
ALTER TABLE `recording` ADD `take_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `recording_idea_idx` ON `recording` (`idea_id`);--> statement-breakpoint
INSERT INTO `idea` (`id`, `account_id`, `created_by`, `title`, `notes`, `created_at`, `updated_at`)
SELECT `id`, `account_id`, `recorded_by`, `title`, `notes`, `created_at`, `updated_at` FROM `recording` WHERE `idea_id` IS NULL;--> statement-breakpoint
UPDATE `recording` SET `idea_id` = `id`, `take_number` = 1, `title` = '', `notes` = '' WHERE `idea_id` IS NULL;
