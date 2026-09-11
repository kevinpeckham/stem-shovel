CREATE TABLE `song_chart_version` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`markdown` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `song_chart_version_song_idx` ON `song_chart_version` (`song_id`,`version_number`);--> statement-breakpoint
ALTER TABLE `song` ADD `chart_markdown` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `chart_hash` text;--> statement-breakpoint
ALTER TABLE `song` ADD `chart_version` integer DEFAULT 0 NOT NULL;