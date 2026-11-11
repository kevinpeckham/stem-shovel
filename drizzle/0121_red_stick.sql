CREATE TABLE `song_arrangement` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`song_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `song_arrangement_song_idx` ON `song_arrangement` (`song_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `song_arrangement_account_idx` ON `song_arrangement` (`account_id`);--> statement-breakpoint
CREATE INDEX `song_arrangement_created_by_idx` ON `song_arrangement` (`created_by`);--> statement-breakpoint
ALTER TABLE `stem` ADD `arrangement_id` text REFERENCES song_arrangement(id);--> statement-breakpoint
CREATE INDEX `stem_arrangement_idx` ON `stem` (`arrangement_id`);