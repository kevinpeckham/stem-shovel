CREATE TABLE `comment_version` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`at` real,
	`edited_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comment_version_comment_idx` ON `comment_version` (`comment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comment_version_edited_by_idx` ON `comment_version` (`edited_by`);--> statement-breakpoint
ALTER TABLE `song_doc_version` ADD `user_id` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `song_doc_version_user_idx` ON `song_doc_version` (`user_id`);