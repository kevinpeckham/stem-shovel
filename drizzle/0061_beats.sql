CREATE TABLE `beat` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_by` text,
	`song_id` text,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `beat_account_idx` ON `beat` (`account_id`);--> statement-breakpoint
CREATE INDEX `beat_created_by_idx` ON `beat` (`created_by`);--> statement-breakpoint
CREATE INDEX `beat_song_idx` ON `beat` (`song_id`);