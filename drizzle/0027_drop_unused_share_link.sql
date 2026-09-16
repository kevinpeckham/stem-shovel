DROP TABLE `share_link`;--> statement-breakpoint
ALTER TABLE `project` ADD `is_private` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `is_private` integer DEFAULT false NOT NULL;