CREATE TABLE `AuditLog` (
	`id` text PRIMARY KEY NOT NULL,
	`testId` text NOT NULL,
	`action` text NOT NULL,
	`userId` text NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `AuditLog_testId_idx` ON `AuditLog` (`testId`);--> statement-breakpoint
CREATE INDEX `AuditLog_userId_idx` ON `AuditLog` (`userId`);--> statement-breakpoint
CREATE TABLE `Metric` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`testId` text NOT NULL,
	`date` text NOT NULL,
	`clicks` integer NOT NULL,
	`impressions` integer NOT NULL,
	`gapFilled` integer DEFAULT false NOT NULL,
	`filledAt` text,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`testId`) REFERENCES `Test`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Metric_testId_date_key` ON `Metric` (`testId`,`date`);--> statement-breakpoint
CREATE INDEX `Metric_testId_date_idx` ON `Metric` (`testId`,`date`);--> statement-breakpoint
CREATE TABLE `Test` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`urls` text DEFAULT '[]' NOT NULL,
	`siteUrl` text NOT NULL,
	`startDate` text NOT NULL,
	`splitDate` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`lastSyncAt` text,
	`lastPValue` real,
	`lastImprovement` real,
	`userId` text NOT NULL,
	`sharedWith` text DEFAULT '[]' NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL,
	`updatedAt` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `Test_userId_idx` ON `Test` (`userId`);--> statement-breakpoint
CREATE INDEX `Test_status_idx` ON `Test` (`status`);--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_unique` ON `User` (`email`);