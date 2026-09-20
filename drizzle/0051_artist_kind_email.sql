ALTER TABLE `artist` ADD `kind` text DEFAULT 'group' NOT NULL;--> statement-breakpoint
ALTER TABLE `artist` ADD `email` text DEFAULT '' NOT NULL;