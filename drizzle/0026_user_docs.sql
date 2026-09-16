CREATE TABLE `user_doc` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`markdown` text DEFAULT '' NOT NULL,
	`content_hash` text,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_doc_slug_unique` ON `user_doc` (`slug`);--> statement-breakpoint
CREATE INDEX `user_doc_updated_by_idx` ON `user_doc` (`updated_by`);--> statement-breakpoint
CREATE TABLE `user_doc_version` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`markdown` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `user_doc`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_doc_version_doc_idx` ON `user_doc_version` (`doc_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `user_doc_version_created_by_idx` ON `user_doc_version` (`created_by`);