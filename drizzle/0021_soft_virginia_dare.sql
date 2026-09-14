CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token` text NOT NULL,
	`invited_by` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_unique` ON `invitation` (`token`);--> statement-breakpoint
CREATE INDEX `invitation_account_idx` ON `invitation` (`account_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
-- Everyone who signed in before verification existed keeps signing in.
UPDATE `user` SET `email_verified` = 1;
