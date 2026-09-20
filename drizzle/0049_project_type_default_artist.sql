ALTER TABLE `account` ADD `default_artist_id` text;--> statement-breakpoint
ALTER TABLE `project` ADD `type` text DEFAULT 'other' NOT NULL;