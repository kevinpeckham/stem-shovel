CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`created_by` text,
	`role` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contact_created_by_idx` ON `contact` (`created_by`);--> statement-breakpoint
CREATE INDEX `contact_account_idx` ON `contact` (`account_id`);--> statement-breakpoint
ALTER TABLE `account_member` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_member` ADD `instruments` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_member` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `promoter_contact_id` text REFERENCES contact(id);--> statement-breakpoint
CREATE INDEX `event_promoter_contact_idx` ON `event` (`promoter_contact_id`);