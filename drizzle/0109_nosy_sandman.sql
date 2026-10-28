CREATE TABLE `account_venue` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`venue_id`) REFERENCES `venue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_venue_unique` ON `account_venue` (`account_id`,`venue_id`);--> statement-breakpoint
CREATE INDEX `account_venue_account_idx` ON `account_venue` (`account_id`);--> statement-breakpoint
CREATE INDEX `account_venue_venue_idx` ON `account_venue` (`venue_id`);--> statement-breakpoint
CREATE TABLE `venue` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`map_url` text DEFAULT '' NOT NULL,
	`website_url` text DEFAULT '' NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `venue_name_idx` ON `venue` (`name`);--> statement-breakpoint
CREATE INDEX `venue_created_by_idx` ON `venue` (`created_by`);--> statement-breakpoint
CREATE INDEX `venue_updated_by_idx` ON `venue` (`updated_by`);--> statement-breakpoint
ALTER TABLE `event` ADD `venue_id` text REFERENCES venue(id);--> statement-breakpoint
CREATE INDEX `event_venue_idx` ON `event` (`venue_id`);--> statement-breakpoint
INSERT INTO `venue` (`id`, `name`, `address`, `city`, `map_url`, `website_url`, `created_by`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(12))), trim(e.venue), trim(e.address), trim(e.city), trim(e.map_url), '', e.created_by, e.created_at, e.updated_at
FROM `event` e
WHERE trim(e.venue) <> ''
  AND e.rowid = (
    SELECT e2.rowid FROM `event` e2
    WHERE lower(trim(e2.venue)) = lower(trim(e.venue)) AND lower(trim(e2.city)) = lower(trim(e.city))
    ORDER BY (trim(e2.address) <> '') DESC, (trim(e2.map_url) <> '') DESC, e2.updated_at DESC, e2.rowid DESC LIMIT 1
  );--> statement-breakpoint
UPDATE `event` SET `venue_id` = (
  SELECT v.id FROM `venue` v
  WHERE lower(v.name) = lower(trim(`event`.venue)) AND lower(v.city) = lower(trim(`event`.city))
  LIMIT 1
) WHERE trim(venue) <> '';--> statement-breakpoint
INSERT INTO `account_venue` (`id`, `account_id`, `venue_id`, `notes`, `contact`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(12))), e.account_id, e.venue_id, trim(e.venue_notes), '', e.created_at, e.updated_at
FROM `event` e
WHERE e.venue_id IS NOT NULL
  AND e.rowid = (
    SELECT e2.rowid FROM `event` e2
    WHERE e2.account_id = e.account_id AND e2.venue_id = e.venue_id
    ORDER BY (trim(e2.venue_notes) <> '') DESC, e2.updated_at DESC, e2.rowid DESC LIMIT 1
  );
