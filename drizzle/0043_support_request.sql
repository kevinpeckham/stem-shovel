CREATE TABLE `support_request` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`account_id` text,
	`message` text NOT NULL,
	`verified_by` text NOT NULL,
	`ip_address` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `support_request_user_idx` ON `support_request` (`user_id`);--> statement-breakpoint
CREATE INDEX `support_request_account_idx` ON `support_request` (`account_id`);--> statement-breakpoint
CREATE INDEX `support_request_status_idx` ON `support_request` (`status`,`created_at`);