CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`starts_on` text NOT NULL,
	`starts_at` text DEFAULT '' NOT NULL,
	`ends_at` text DEFAULT '' NOT NULL,
	`load_in_at` text DEFAULT '' NOT NULL,
	`sound_check_at` text DEFAULT '' NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`map_url` text DEFAULT '' NOT NULL,
	`venue_notes` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_account_idx` ON `event` (`account_id`);--> statement-breakpoint
CREATE INDEX `event_day_idx` ON `event` (`account_id`,`starts_on`);--> statement-breakpoint
CREATE INDEX `event_created_by_idx` ON `event` (`created_by`);--> statement-breakpoint
CREATE TABLE `event_set` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`set_list_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_list_id`) REFERENCES `set_list`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_set_event_idx` ON `event_set` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_set_set_list_idx` ON `event_set` (`set_list_id`);--> statement-breakpoint
ALTER TABLE `recording_session` ADD `event_id` text REFERENCES event(id);--> statement-breakpoint
CREATE INDEX `recording_session_event_idx` ON `recording_session` (`event_id`);--> statement-breakpoint
-- A song row's title is now its custom title; '' means "follow the song" (docs/band-plan.md, set lists).
UPDATE `set_list_item` SET `title` = '' WHERE `song_id` IS NOT NULL;
