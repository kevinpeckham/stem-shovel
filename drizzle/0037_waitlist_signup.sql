CREATE TABLE `waitlist_signup` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`updates_ok` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirm_token` text NOT NULL,
	`manage_token` text NOT NULL,
	`confirmed_at` integer,
	`invited_at` integer,
	`invite_code_id` text,
	`source` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`invite_code_id`) REFERENCES `invite_code`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_signup_email_unique` ON `waitlist_signup` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_signup_confirm_token_unique` ON `waitlist_signup` (`confirm_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_signup_manage_token_unique` ON `waitlist_signup` (`manage_token`);--> statement-breakpoint
CREATE INDEX `waitlist_status_idx` ON `waitlist_signup` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `waitlist_invite_code_idx` ON `waitlist_signup` (`invite_code_id`);