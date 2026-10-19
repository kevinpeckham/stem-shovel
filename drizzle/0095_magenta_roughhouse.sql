ALTER TABLE `share_link` ADD `recording_id` text REFERENCES session_recording(id);--> statement-breakpoint
CREATE INDEX `share_link_recording_idx` ON `share_link` (`recording_id`);