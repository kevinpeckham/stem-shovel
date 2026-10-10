CREATE TABLE `amp_preset` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_by` text,
	`name` text NOT NULL,
	`instrument` text NOT NULL,
	`slot` integer,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `amp_preset_account_idx` ON `amp_preset` (`account_id`);--> statement-breakpoint
CREATE INDEX `amp_preset_created_by_idx` ON `amp_preset` (`created_by`);