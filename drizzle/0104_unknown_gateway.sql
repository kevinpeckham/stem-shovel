CREATE TABLE `dashboard_pin` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `target_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dashboard_pin_target_idx` ON `dashboard_pin` (`target_id`);--> statement-breakpoint
CREATE INDEX `dashboard_pin_account_idx` ON `dashboard_pin` (`account_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `dashboard_seen_at` integer;