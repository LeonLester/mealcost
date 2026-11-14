-- Per-user feature access, managed from the admin page. 0 = free, 1 = receipt parsing allowed.
ALTER TABLE users ADD COLUMN receipts INTEGER NOT NULL DEFAULT 0;
