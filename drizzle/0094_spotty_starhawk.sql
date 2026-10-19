ALTER TABLE `session_recording` ADD `song_id` text REFERENCES song(id);--> statement-breakpoint
CREATE INDEX `session_recording_song_idx` ON `session_recording` (`song_id`);