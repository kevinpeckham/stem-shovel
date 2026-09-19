ALTER TABLE `bug_report` ADD `priority` text;--> statement-breakpoint
ALTER TABLE `bug_report` ADD `response` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bug_report` ADD `responded_at` integer;