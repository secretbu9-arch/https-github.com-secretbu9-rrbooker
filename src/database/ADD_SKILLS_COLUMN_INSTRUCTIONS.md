# Add Skills Column to Users Table

## Problem
The `skills` column doesn't exist in the `users` table, causing the barber skills feature to not work properly.

## Solution
Run the following SQL commands in your Supabase SQL Editor:

### Step 1: Add the Skills Column
```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS skills TEXT;
```

### Step 2: Add Column Documentation
```sql
COMMENT ON COLUMN users.skills IS 'Comma-separated list of barber skills/specializations';
```

### Step 3: Set Default Skills for Existing Barbers (Optional)
```sql
UPDATE users 
SET skills = 'Haircut, Beard Trim, Styling'
WHERE role = 'barber' 
AND skills IS NULL;
```

### Step 4: Create Search Index (Optional)
```sql
CREATE INDEX IF NOT EXISTS idx_users_skills ON users USING gin(to_tsvector('english', skills));
```

## How to Execute

1. **Open Supabase Dashboard**
2. **Go to SQL Editor**
3. **Copy and paste the SQL commands above**
4. **Execute each command one by one**

## Verification

After running the migration, you can verify it worked by running:

```sql
SELECT id, full_name, role, skills 
FROM users 
WHERE role = 'barber' 
LIMIT 5;
```

You should see the `skills` column with values for barbers.

## Features Enabled

Once the column is added, the following features will work:

- ✅ Barbers can add/edit skills in their profile
- ✅ Managers can add skills when creating/editing barbers
- ✅ Skills display as badges in barber cards
- ✅ Skills are searchable and filterable
