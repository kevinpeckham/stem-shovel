ALTER TABLE `share_link` ADD `demo_id` text REFERENCES demo(id);--> statement-breakpoint
CREATE INDEX `share_link_demo_idx` ON `share_link` (`demo_id`);