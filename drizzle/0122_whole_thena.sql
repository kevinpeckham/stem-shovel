DROP INDEX `stem_pathname_unique`;--> statement-breakpoint
ALTER TABLE `stem` ADD `muted` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `stem_pathname_idx` ON `stem` (`pathname`);--> statement-breakpoint
ALTER TABLE `song_arrangement` ADD `note` text DEFAULT '' NOT NULL;