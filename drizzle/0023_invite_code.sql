CREATE TABLE `invite_code` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`code` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_code_code_unique` ON `invite_code` (`code`);--> statement-breakpoint
CREATE INDEX `invite_code_account_idx` ON `invite_code` (`account_id`);--> statement-breakpoint
CREATE INDEX `invite_code_created_by_idx` ON `invite_code` (`created_by`);