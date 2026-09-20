CREATE TABLE `artist` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_name` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artist_account_idx` ON `artist` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `artist_account_name_unique` ON `artist` (`account_id`,`name`);--> statement-breakpoint
CREATE TABLE `song_credit` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`role` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `song_credit_song_idx` ON `song_credit` (`song_id`);--> statement-breakpoint
CREATE INDEX `song_credit_artist_idx` ON `song_credit` (`artist_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `song_credit_unique` ON `song_credit` (`song_id`,`artist_id`,`role`);