ALTER TABLE `project` ADD `no_ai` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `no_ai` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `notes_json` text;--> statement-breakpoint
ALTER TABLE `song` ADD `notes_key` text;--> statement-breakpoint
ALTER TABLE `song` ADD `notes_done_seconds` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `notes_started_at` integer;