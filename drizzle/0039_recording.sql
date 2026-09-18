CREATE TABLE `recording` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`recorded_by` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`duration_seconds` real,
	`playback_status` text,
	`playback_url` text,
	`playback_pathname` text,
	`playback_bytes` integer,
	`playback_started_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recording_pathname_unique` ON `recording` (`pathname`);--> statement-breakpoint
CREATE INDEX `recording_account_idx` ON `recording` (`account_id`);--> statement-breakpoint
CREATE INDEX `recording_recorded_by_idx` ON `recording` (`recorded_by`);