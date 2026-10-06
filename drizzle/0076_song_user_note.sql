CREATE TABLE `song_user_note` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`song_id` text NOT NULL,
	`user_id` text NOT NULL,
	`markdown` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `song_user_note_account_idx` ON `song_user_note` (`account_id`);--> statement-breakpoint
CREATE INDEX `song_user_note_song_idx` ON `song_user_note` (`song_id`);--> statement-breakpoint
CREATE INDEX `song_user_note_user_idx` ON `song_user_note` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `song_user_note_unique` ON `song_user_note` (`song_id`,`user_id`);