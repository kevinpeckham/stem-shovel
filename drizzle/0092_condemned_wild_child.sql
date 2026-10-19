CREATE TABLE `session_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`recording_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`at` real,
	`edited_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `session_recording`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_comment_account_idx` ON `session_comment` (`account_id`);--> statement-breakpoint
CREATE INDEX `session_comment_recording_idx` ON `session_comment` (`recording_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `session_comment_user_idx` ON `session_comment` (`user_id`);--> statement-breakpoint
CREATE TABLE `session_chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`edited_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `recording_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_chat_message_account_idx` ON `session_chat_message` (`account_id`);--> statement-breakpoint
CREATE INDEX `session_chat_message_session_idx` ON `session_chat_message` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `session_chat_message_user_idx` ON `session_chat_message` (`user_id`);--> statement-breakpoint
CREATE TABLE `session_chat_read` (
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `session_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `recording_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_chat_read_session_idx` ON `session_chat_read` (`session_id`);--> statement-breakpoint
ALTER TABLE `comment` ADD `demo_id` text REFERENCES demo(id);--> statement-breakpoint
CREATE INDEX `comment_demo_idx` ON `comment` (`demo_id`);--> statement-breakpoint
ALTER TABLE `demo` ADD `duration_seconds` real;--> statement-breakpoint
ALTER TABLE `demo` ADD `peaks` text;--> statement-breakpoint
ALTER TABLE `demo` ADD `peaks_started_at` integer;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `duration_seconds` real;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `peaks` text;--> statement-breakpoint
ALTER TABLE `session_recording` ADD `peaks_started_at` integer;