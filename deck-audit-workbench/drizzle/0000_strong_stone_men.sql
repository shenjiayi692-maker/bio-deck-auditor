CREATE TABLE `deck_files` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`processing_state` text DEFAULT 'uploaded' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evidence_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`provider` text NOT NULL,
	`identifier` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '候选记录' NOT NULL,
	`raw_json` text DEFAULT '{}' NOT NULL,
	`retrieved_at` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_decisions` (
	`claim_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reviewer` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
