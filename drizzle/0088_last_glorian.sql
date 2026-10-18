CREATE TABLE `session_recording` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text DEFAULT 'practice' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`recorded_on` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_recording_pathname_unique` ON `session_recording` (`pathname`);--> statement-breakpoint
CREATE INDEX `session_recording_account_idx` ON `session_recording` (`account_id`);--> statement-breakpoint
CREATE INDEX `session_recording_day_idx` ON `session_recording` (`account_id`,`recorded_on`);--> statement-breakpoint
CREATE INDEX `session_recording_uploaded_by_idx` ON `session_recording` (`uploaded_by`);