CREATE TABLE `bug_report_vote` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`user_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `bug_report`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bug_report_vote_report_idx` ON `bug_report_vote` (`report_id`);--> statement-breakpoint
CREATE INDEX `bug_report_vote_user_idx` ON `bug_report_vote` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bug_report_vote_unique` ON `bug_report_vote` (`report_id`,`user_id`);