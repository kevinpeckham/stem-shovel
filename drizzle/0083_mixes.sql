CREATE TABLE `song_mix` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`song_id` text NOT NULL,
	`version` integer NOT NULL,
	`label` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`duration_seconds` real,
	`peaks` text,
	`playback_status` text,
	`playback_url` text,
	`playback_pathname` text,
	`playback_bytes` integer,
	`playback_started_at` integer,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_mix_pathname_unique` ON `song_mix` (`pathname`);--> statement-breakpoint
CREATE INDEX `song_mix_song_idx` ON `song_mix` (`song_id`,`version`);--> statement-breakpoint
CREATE INDEX `song_mix_account_idx` ON `song_mix` (`account_id`);--> statement-breakpoint
CREATE INDEX `song_mix_uploaded_by_idx` ON `song_mix` (`uploaded_by`);--> statement-breakpoint
ALTER TABLE `comment` ADD `mix_id` text REFERENCES song_mix(id);--> statement-breakpoint
CREATE INDEX `comment_mix_idx` ON `comment` (`mix_id`);--> statement-breakpoint
ALTER TABLE `share_link` ADD `mix_id` text REFERENCES song_mix(id);