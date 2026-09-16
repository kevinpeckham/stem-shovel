CREATE TABLE `share_link` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`project_id` text,
	`song_id` text,
	`code` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`expires_at` integer,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_link_code_unique` ON `share_link` (`code`);--> statement-breakpoint
CREATE INDEX `share_link_account_idx` ON `share_link` (`account_id`);--> statement-breakpoint
CREATE INDEX `share_link_project_idx` ON `share_link` (`project_id`);--> statement-breakpoint
CREATE INDEX `share_link_song_idx` ON `share_link` (`song_id`);--> statement-breakpoint
CREATE INDEX `share_link_created_by_idx` ON `share_link` (`created_by`);