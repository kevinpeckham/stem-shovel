CREATE TABLE `chat_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`song_id` text,
	`session_id` text,
	`message_id` text,
	`session_message_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`thumbnail_url` text,
	`thumbnail_pathname` text,
	`share_code` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `recording_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_message_id`) REFERENCES `session_chat_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_attachment_pathname_unique` ON `chat_attachment` (`pathname`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_attachment_share_code_unique` ON `chat_attachment` (`share_code`);--> statement-breakpoint
CREATE INDEX `chat_attachment_account_idx` ON `chat_attachment` (`account_id`);--> statement-breakpoint
CREATE INDEX `chat_attachment_song_idx` ON `chat_attachment` (`song_id`);--> statement-breakpoint
CREATE INDEX `chat_attachment_session_idx` ON `chat_attachment` (`session_id`);--> statement-breakpoint
CREATE INDEX `chat_attachment_message_idx` ON `chat_attachment` (`message_id`);--> statement-breakpoint
CREATE INDEX `chat_attachment_session_message_idx` ON `chat_attachment` (`session_message_id`);--> statement-breakpoint
CREATE INDEX `chat_attachment_uploaded_by_idx` ON `chat_attachment` (`uploaded_by`);