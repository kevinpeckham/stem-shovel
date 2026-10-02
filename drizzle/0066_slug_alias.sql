CREATE TABLE `slug_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`scope_id` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `slug_alias_target_idx` ON `slug_alias` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `slug_alias_slug_unique` ON `slug_alias` (`kind`,`scope_id`,`slug`);