CREATE TABLE `event_payout` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text,
	`name` text DEFAULT '' NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_payout_account_idx` ON `event_payout` (`account_id`);--> statement-breakpoint
CREATE INDEX `event_payout_event_idx` ON `event_payout` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_payout_user_idx` ON `event_payout` (`user_id`);--> statement-breakpoint
ALTER TABLE `account` ADD `currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `ticket_price` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `ticket_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `tickets_sold` integer;--> statement-breakpoint
ALTER TABLE `event` ADD `attendance` integer;--> statement-breakpoint
ALTER TABLE `event` ADD `deal` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `promoter` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `promoter_contact` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `take_cents` integer;