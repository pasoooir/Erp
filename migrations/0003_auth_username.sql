ALTER TABLE users ADD COLUMN username TEXT;

UPDATE users
SET username = lower(substr(email, 1, instr(email, '@') - 1));

UPDATE users
SET username = 'user_' || substr(id, 1, 8)
WHERE username IS NULL
   OR length(username) < 3
   OR length(username) > 64
   OR username GLOB '*[^a-z0-9._-]*'
   OR username GLOB '[._-]*';

UPDATE users
SET username = substr(username, 1, 54) || '_' || substr(id, 1, 8)
WHERE id NOT IN (
  SELECT MIN(id) FROM users GROUP BY username
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);
