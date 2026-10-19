CREATE TABLE `studio_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`idea_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`at` real,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`idea_id`) REFERENCES `idea`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `studio_comment_account_idx` ON `studio_comment` (`account_id`);--> statement-breakpoint
CREATE INDEX `studio_comment_idea_idx` ON `studio_comment` (`idea_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `studio_comment_user_idx` ON `studio_comment` (`user_id`);--> statement-breakpoint
ALTER TABLE `idea` ADD `shared` integer DEFAULT false NOT NULL;