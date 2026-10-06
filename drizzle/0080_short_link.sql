CREATE TABLE `short_link` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`created_by` text,
	`account_id` text,
	`expires_at` integer,
	`hits` integer DEFAULT 0 NOT NULL,
	`last_hit_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `short_link_code_unique` ON `short_link` (`code`);--> statement-breakpoint
CREATE INDEX `short_link_created_by_idx` ON `short_link` (`created_by`);--> statement-breakpoint
CREATE INDEX `short_link_account_idx` ON `short_link` (`account_id`);--> statement-breakpoint
CREATE INDEX `short_link_expires_at_idx` ON `short_link` (`expires_at`);