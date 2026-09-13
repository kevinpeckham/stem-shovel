CREATE TABLE `demo` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`song_id` text NOT NULL,
	`label` text NOT NULL,
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
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_pathname_unique` ON `demo` (`pathname`);--> statement-breakpoint
CREATE INDEX `demo_song_idx` ON `demo` (`song_id`);--> statement-breakpoint
CREATE INDEX `demo_account_idx` ON `demo` (`account_id`);--> statement-breakpoint
ALTER TABLE `song` ADD `songwriter` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `written_on` text;