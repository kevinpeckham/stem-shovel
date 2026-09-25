CREATE TABLE `project_member` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`added_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_member_project_idx` ON `project_member` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_member_user_idx` ON `project_member` (`user_id`);--> statement-breakpoint
CREATE INDEX `project_member_added_by_idx` ON `project_member` (`added_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_member_unique` ON `project_member` (`project_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `invitation` ADD `project_id` text REFERENCES project(id);--> statement-breakpoint
CREATE INDEX `invitation_project_idx` ON `invitation` (`project_id`);--> statement-breakpoint
ALTER TABLE `project` ADD `is_restricted` integer DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO `project_member` (`id`, `project_id`, `user_id`, `role`, `added_by`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(11))), p.`id`, m.`user_id`, 'viewer', NULL, m.`created_at`, m.`updated_at`
FROM `account_member` m JOIN `project` p ON p.`account_id` = m.`account_id`
WHERE m.`role` = 'viewer';--> statement-breakpoint
DELETE FROM `account_member` WHERE `role` = 'viewer';--> statement-breakpoint
UPDATE `invitation` SET `revoked_at` = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE `role` = 'viewer' AND `project_id` IS NULL AND `accepted_at` IS NULL AND `revoked_at` IS NULL;--> statement-breakpoint
UPDATE `invite_code` SET `revoked_at` = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE `role` = 'viewer' AND `revoked_at` IS NULL;
