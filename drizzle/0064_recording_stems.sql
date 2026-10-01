CREATE TABLE `recording_stem` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`recording_id` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`codec` text,
	`duration_seconds` real,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `recording`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recording_stem_pathname_unique` ON `recording_stem` (`pathname`);--> statement-breakpoint
CREATE INDEX `recording_stem_account_idx` ON `recording_stem` (`account_id`);--> statement-breakpoint
CREATE INDEX `recording_stem_recording_idx` ON `recording_stem` (`recording_id`);