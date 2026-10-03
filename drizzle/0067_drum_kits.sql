CREATE TABLE `drum_kit` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`created_by` text,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `drum_kit_account_idx` ON `drum_kit` (`account_id`);--> statement-breakpoint
CREATE INDEX `drum_kit_created_by_idx` ON `drum_kit` (`created_by`);--> statement-breakpoint
CREATE TABLE `drum_sample` (
	`id` text PRIMARY KEY NOT NULL,
	`kit_id` text NOT NULL,
	`account_id` text,
	`voice` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`kit_id`) REFERENCES `drum_kit`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drum_sample_pathname_unique` ON `drum_sample` (`pathname`);--> statement-breakpoint
CREATE INDEX `drum_sample_kit_idx` ON `drum_sample` (`kit_id`);--> statement-breakpoint
CREATE INDEX `drum_sample_account_idx` ON `drum_sample` (`account_id`);--> statement-breakpoint
CREATE INDEX `drum_sample_uploaded_by_idx` ON `drum_sample` (`uploaded_by`);