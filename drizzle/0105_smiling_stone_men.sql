CREATE TABLE `set_list` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `set_list_account_idx` ON `set_list` (`account_id`);--> statement-breakpoint
CREATE INDEX `set_list_created_by_idx` ON `set_list` (`created_by`);--> statement-breakpoint
CREATE TABLE `set_list_item` (
	`id` text PRIMARY KEY NOT NULL,
	`set_list_id` text NOT NULL,
	`song_id` text,
	`title` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`set_list_id`) REFERENCES `set_list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `set_list_item_set_list_idx` ON `set_list_item` (`set_list_id`);--> statement-breakpoint
CREATE INDEX `set_list_item_song_idx` ON `set_list_item` (`song_id`);--> statement-breakpoint
ALTER TABLE `share_link` ADD `set_list_id` text REFERENCES set_list(id);--> statement-breakpoint
CREATE INDEX `share_link_set_list_idx` ON `share_link` (`set_list_id`);