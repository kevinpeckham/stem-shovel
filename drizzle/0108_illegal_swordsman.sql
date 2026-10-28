CREATE TABLE `event_file` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`caption` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`thumbnail_url` text,
	`thumbnail_pathname` text,
	`share_code` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_file_pathname_unique` ON `event_file` (`pathname`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_file_share_code_unique` ON `event_file` (`share_code`);--> statement-breakpoint
CREATE INDEX `event_file_account_idx` ON `event_file` (`account_id`);--> statement-breakpoint
CREATE INDEX `event_file_event_idx` ON `event_file` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_file_event_kind_idx` ON `event_file` (`event_id`,`kind`);--> statement-breakpoint
CREATE INDEX `event_file_uploaded_by_idx` ON `event_file` (`uploaded_by`);