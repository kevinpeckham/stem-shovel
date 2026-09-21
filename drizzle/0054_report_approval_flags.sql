ALTER TABLE `bug_report` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `bug_report` ADD `flags` text DEFAULT '' NOT NULL;