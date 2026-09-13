ALTER TABLE `song` ADD `notes_markdown` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `notes_hash` text;--> statement-breakpoint
ALTER TABLE `song` ADD `notes_version` integer DEFAULT 0 NOT NULL;