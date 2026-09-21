ALTER TABLE `user_doc` ADD `kind` text DEFAULT 'doc' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_doc` ADD `published_at` integer;