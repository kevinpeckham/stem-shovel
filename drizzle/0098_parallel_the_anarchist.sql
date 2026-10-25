CREATE TABLE `chat_reaction` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_reaction_once_idx` ON `chat_reaction` (`message_id`,`user_id`,`emoji`);--> statement-breakpoint
CREATE INDEX `chat_reaction_message_idx` ON `chat_reaction` (`message_id`);--> statement-breakpoint
CREATE INDEX `chat_reaction_user_idx` ON `chat_reaction` (`user_id`);--> statement-breakpoint
ALTER TABLE `chat_message` ADD `mentions` text;--> statement-breakpoint
ALTER TABLE `session_chat_message` ADD `mentions` text;