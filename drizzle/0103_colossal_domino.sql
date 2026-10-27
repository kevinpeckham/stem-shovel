ALTER TABLE `share_link` ADD `session_id` text REFERENCES recording_session(id);--> statement-breakpoint
CREATE INDEX `share_link_session_idx` ON `share_link` (`session_id`);