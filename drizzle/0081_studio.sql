CREATE TABLE `studio_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`idea_id` text NOT NULL,
	`saved_by` text,
	`name` text,
	`number` integer NOT NULL,
	`data` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`idea_id`) REFERENCES `idea`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `studio_revision_account_idx` ON `studio_revision` (`account_id`);--> statement-breakpoint
CREATE INDEX `studio_revision_idea_number_idx` ON `studio_revision` (`idea_id`,`number`);--> statement-breakpoint
CREATE INDEX `studio_revision_saved_by_idx` ON `studio_revision` (`saved_by`);--> statement-breakpoint
CREATE TABLE `studio_source` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`idea_id` text NOT NULL,
	`recorded_by` text,
	`kind` text DEFAULT 'take' NOT NULL,
	`take_number` integer DEFAULT 0 NOT NULL,
	`track_label` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`codec` text,
	`sample_rate` integer NOT NULL,
	`channels` integer DEFAULT 1 NOT NULL,
	`duration_seconds` real DEFAULT 0 NOT NULL,
	`peaks` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`idea_id`) REFERENCES `idea`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_source_pathname_unique` ON `studio_source` (`pathname`);--> statement-breakpoint
CREATE INDEX `studio_source_account_idx` ON `studio_source` (`account_id`);--> statement-breakpoint
CREATE INDEX `studio_source_idea_idx` ON `studio_source` (`idea_id`);--> statement-breakpoint
CREATE INDEX `studio_source_recorded_by_idx` ON `studio_source` (`recorded_by`);