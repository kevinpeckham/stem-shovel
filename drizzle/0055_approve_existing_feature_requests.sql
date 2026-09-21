-- Feature requests that existed before approval was introduced (v0.28.0) were already public; keep them so.
UPDATE `bug_report` SET `approved_at` = `created_at` WHERE `kind` = 'feature' AND `approved_at` IS NULL;
