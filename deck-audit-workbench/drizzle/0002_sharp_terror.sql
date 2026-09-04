ALTER TABLE `deck_files` ADD `analysis_filename` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `deck_files` SET `analysis_filename` = `filename` WHERE `analysis_filename` = '';
