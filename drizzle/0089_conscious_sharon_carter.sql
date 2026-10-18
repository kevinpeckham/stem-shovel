CREATE TABLE `recording_session` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text DEFAULT 'practice' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`starts_on` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recording_session_account_idx` ON `recording_session` (`account_id`);--> statement-breakpoint
CREATE INDEX `recording_session_day_idx` ON `recording_session` (`account_id`,`starts_on`);--> statement-breakpoint
CREATE INDEX `recording_session_created_by_idx` ON `recording_session` (`created_by`);--> statement-breakpoint
ALTER TABLE `session_recording` ADD `session_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `playback_status` text;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `playback_url` text;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `playback_pathname` text;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `playback_bytes` integer;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `playback_started_at` integer;--> statement-breakpoint
CREATE INDEX `session_recording_session_idx` ON `session_recording` (`session_id`);--> statement-breakpoint
INSERT INTO `recording_session` (`id`, `account_id`, `kind`, `name`, `starts_on`, `place`, `notes`, `created_by`, `created_at`, `updated_at`)
SELECT substr(hex(randomblob(11)), 1, 21), `account_id`, `kind`, '', `recorded_on`, `place`, '', min(`uploaded_by`), min(`created_at`), min(`created_at`)
FROM `session_recording`
GROUP BY `account_id`, `kind`, `recorded_on`, `place`;--> statement-breakpoint
UPDATE `session_recording` SET `session_id` = (
	SELECT s.`id` FROM `recording_session` s
	WHERE s.`account_id` = `session_recording`.`account_id`
		AND s.`kind` = `session_recording`.`kind`
		AND s.`starts_on` = `session_recording`.`recorded_on`
		AND s.`place` = `session_recording`.`place`
	LIMIT 1
) WHERE `session_id` = '';
