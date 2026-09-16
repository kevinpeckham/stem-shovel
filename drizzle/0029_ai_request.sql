CREATE TABLE `ai_request` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`model` text NOT NULL,
	`user_id` text,
	`song_id` text,
	`prompt` text NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`parsed` text,
	`error` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_request_created_idx` ON `ai_request` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_request_user_idx` ON `ai_request` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_request_song_idx` ON `ai_request` (`song_id`);