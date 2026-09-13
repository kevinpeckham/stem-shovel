ALTER TABLE `song` ADD `version` text DEFAULT '0.0.1' NOT NULL;--> statement-breakpoint
ALTER TABLE `song` ADD `stems_updated_at` integer;--> statement-breakpoint
UPDATE `song` SET `stems_updated_at` = (SELECT max(`updated_at`) FROM `stem` WHERE `stem`.`song_id` = `song`.`id` AND `stem`.`status` = 'ready');
