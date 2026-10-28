CREATE TABLE `practice_location` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `practice_location_account_idx` ON `practice_location` (`account_id`);--> statement-breakpoint
CREATE INDEX `practice_location_account_name_idx` ON `practice_location` (`account_id`,`name`);--> statement-breakpoint
CREATE INDEX `practice_location_created_by_idx` ON `practice_location` (`created_by`);--> statement-breakpoint
ALTER TABLE `account` ADD `calendar_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `account_calendar_token_unique` ON `account` (`calendar_token`);--> statement-breakpoint
ALTER TABLE `event` ADD `location_id` text REFERENCES practice_location(id);--> statement-breakpoint
CREATE INDEX `event_location_idx` ON `event` (`location_id`);--> statement-breakpoint
INSERT INTO `practice_location` (`id`, `account_id`, `name`, `address`, `notes`, `created_by`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(12))), e.account_id, v.name,
       trim(v.address || CASE WHEN trim(v.city) <> '' AND trim(v.address) <> '' THEN ', ' ELSE '' END || v.city),
       coalesce((SELECT av.notes FROM `account_venue` av WHERE av.account_id = e.account_id AND av.venue_id = v.id), ''),
       e.created_by, e.created_at, e.updated_at
FROM `event` e JOIN `venue` v ON v.id = e.venue_id
WHERE e.kind = 'practice'
  AND e.rowid = (
    SELECT e2.rowid FROM `event` e2
    WHERE e2.kind = 'practice' AND e2.account_id = e.account_id AND e2.venue_id = e.venue_id
    ORDER BY e2.updated_at DESC, e2.rowid DESC LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM `practice_location` pl WHERE pl.account_id = e.account_id AND lower(pl.name) = lower(v.name)
  );--> statement-breakpoint
UPDATE `event` SET `location_id` = (
  SELECT pl.id FROM `practice_location` pl JOIN `venue` v ON v.id = `event`.venue_id
  WHERE pl.account_id = `event`.account_id AND lower(pl.name) = lower(v.name)
  LIMIT 1
) WHERE kind = 'practice' AND venue_id IS NOT NULL;--> statement-breakpoint
UPDATE `event` SET `venue_id` = NULL WHERE kind = 'practice';
