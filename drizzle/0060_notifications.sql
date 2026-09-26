CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text,
	`kind` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`href` text DEFAULT '' NOT NULL,
	`subject_id` text,
	`count` integer DEFAULT 1 NOT NULL,
	`read_at` integer,
	`emailed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notification_account_idx` ON `notification` (`account_id`);--> statement-breakpoint
CREATE INDEX `notification_subject_idx` ON `notification` (`user_id`,`kind`,`subject_id`);--> statement-breakpoint
CREATE TABLE `notification_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email_comments` integer DEFAULT false NOT NULL,
	`email_stems` integer DEFAULT false NOT NULL,
	`email_songs` integer DEFAULT false NOT NULL,
	`email_demos` integer DEFAULT false NOT NULL,
	`digest` text DEFAULT 'none' NOT NULL,
	`digest_sent_at` integer,
	`sms_number` text,
	`sms_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
