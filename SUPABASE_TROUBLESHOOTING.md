# Stand With Meg - Supabase Troubleshooting Guide

Common issues and solutions for Supabase setup and integration.

---

## Environment Variables

### Problem: "NEXT_PUBLIC_SUPABASE_URL is undefined"

**Symptoms:**
- Error in browser console about missing Supabase URL
- App won't connect to database

**Solution:**
1. Open `.env.local` file
2. Verify these lines exist and have values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```
3. Make sure there are NO spaces before/after the `=` sign
4. Make sure there are NO quotes around the values
5. Save the file
6. **RESTART your Next.js dev server** (stop and `npm run dev`)

**Verification:**
```bash
# Run this to verify variables are set
echo "URL: $NEXT_PUBLIC_SUPABASE_URL"
echo "Anon Key: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "Service Role Key: $SUPABASE_SERVICE_ROLE_KEY"
```

---

### Problem: "Service Role Key should never be in browser"

**Symptoms:**
- Security warning about service role key
- App is slower than expected

**Solution:**
- `SUPABASE_SERVICE_ROLE_KEY` should ONLY be used in:
  - `/app/api/*` routes (server-side)
  - Never in client components
  - Never exposed to browser

**Check:**
- If your code uses `SUPABASE_SERVICE_ROLE_KEY` in a client component, move it to an API route
- The key should NOT appear in browser network requests

---

## Database Connection

### Problem: "Failed to connect to Supabase database"

**Symptoms:**
- Any database query throws an error
- App loads but can't save data

**Solution:**

1. **Verify Supabase project is running:**
   - Go to https://app.supabase.com
   - Click on your project
   - Look for any error messages on the dashboard
   - If project shows "paused", click "Resume"

2. **Check credentials are correct:**
   ```bash
   # Visit this URL in your browser (replace with your URL)
   https://xxxxxxxxxxxxx.supabase.co/rest/v1/
   # You should see a JSON response (not a 404 error)
   ```

3. **Test from Next.js terminal:**
   ```bash
   # In your project directory
   npm run dev
   ```
   Look for errors in the terminal about Supabase

4. **Test with a simple query:**
   Create `/app/test/page.tsx`:
   ```typescript
   'use client';
   import { useEffect } from 'react';
   import { supabase } from '@/lib/supabaseClient';

   export default function TestPage() {
     useEffect(() => {
       const test = async () => {
         const { data, error } = await supabase.from('users').select('count()', { count: 'exact' });
         if (error) console.error('Error:', error);
         else console.log('Success! Count:', data);
       };
       test();
     }, []);

     return <div>Check console for test results</div>;
   }
   ```
   - Open http://localhost:3000/test
   - Open browser DevTools > Console
   - Look for "Success!" or error message

---

## Authentication

### Problem: "User registration fails"

**Symptoms:**
- Sign up form submits but user is not created
- Error message appears

**Solution:**

1. **Check email is valid:**
   - Error: "Invalid email" → Email format is wrong
   - Fix: Use a real email like `john@example.com`

2. **Check password requirements:**
   - Error: "Password too short" → Password must be 6+ characters
   - Fix: Use a stronger password

3. **Check email is not already registered:**
   - Error: "User already exists" → Email already has account
   - Fix: Use a different email or reset password

4. **Enable email confirmation (if required):**
   - Go to Supabase Dashboard → Authentication → Providers
   - Check if "Confirm email" is enabled
   - If yes, user must click email link to activate account

5. **Check user record creation:**
   - Sign up succeeds but user doesn't appear in "users" table?
   - Problem: The INSERT to users table failed
   - Check: Verify you're inserting the auth.uid() correctly
   ```typescript
   // WRONG ❌
   const { error } = await supabase.from('users').insert([
     { email: authUser.email }  // Missing id!
   ]);

   // RIGHT ✓
   const { error } = await supabase.from('users').insert([
     { id: authUser.id, email: authUser.email }  // Include id!
   ]);
   ```

---

### Problem: "Login fails or session doesn't persist"

**Symptoms:**
- Can log in but session doesn't save
- User is logged out after page refresh
- Auth state keeps changing

**Solution:**

1. **Check session storage is enabled:**
   ```typescript
   // In supabaseClient.ts
   export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
     auth: {
       persistSession: true,      // ← Must be true
       autoRefreshToken: true,    // ← Must be true
     },
   });
   ```

2. **Clear browser storage and retry:**
   - Open DevTools > Application > Local Storage
   - Delete all entries starting with "sb-"
   - Refresh page and try logging in again

3. **Check for auth state listener:**
   ```typescript
   // Good practice: Listen to auth changes
   useEffect(() => {
     const { data: { subscription } } = supabase.auth.onAuthStateChange(
       async (event, session) => {
         setSession(session);
       }
     );
     return () => subscription?.unsubscribe();
   }, []);
   ```

4. **Check email is verified (if required):**
   - If "Confirm email" is enabled, user must verify email
   - User won't be fully authenticated until email is confirmed

---

## Row Level Security (RLS)

### Problem: "Permission denied" or "new row violates row level security policy"

**Symptoms:**
- User can't access their own data
- Database operations return "permission denied"
- Data inserts fail

**Solution:**

1. **Verify RLS is enabled:**
   - Supabase Dashboard → Table → Row Level Security icon
   - Should show RLS is "ON"
   - If OFF, enable it

2. **Verify policies exist:**
   - Supabase Dashboard → Table → Policies tab
   - Should see policies like "Users can view..." etc.
   - If empty, re-run the RLS policy SQL commands

3. **Check if user is authenticated:**
   ```typescript
   // RLS policies only work for authenticated users
   // Test: Are you logged in?
   const { data: { user } } = await supabase.auth.getUser();
   console.log('Current user:', user?.id);  // Must NOT be null
   ```

4. **Common RLS mistakes:**

   **WRONG - Hardcoded user ID:**
   ```sql
   WHERE user_id = 'abc123'  -- ❌ WRONG: Always filters same user
   ```

   **RIGHT - Use auth.uid():**
   ```sql
   WHERE user_id = auth.uid()  -- ✓ RIGHT: Filters current user
   ```

   **WRONG - Missing parentheses in policy:**
   ```sql
   WHERE vault_id IN SELECT id FROM vaults WHERE user_id = auth.uid()  -- ❌
   ```

   **RIGHT - Proper parentheses:**
   ```sql
   WHERE vault_id IN (SELECT id FROM vaults WHERE user_id = auth.uid())  -- ✓
   ```

5. **Test RLS policy directly:**
   ```typescript
   // This should work (you own the data)
   const { data, error } = await supabase
     .from('vaults')
     .select('*')
     .eq('user_id', currentUserId);
   console.log('Result:', data, error);

   // This should fail (doesn't own the data)
   const { data, error } = await supabase
     .from('vaults')
     .select('*')
     .eq('user_id', 'different-user-id');
   console.log('Result:', data, error);  // Should be null or empty
   ```

---

## Storage & File Upload

### Problem: "Failed to upload file"

**Symptoms:**
- File upload returns error
- File doesn't appear in storage bucket

**Solution:**

1. **Check storage bucket exists:**
   - Supabase Dashboard → Storage
   - Should see `documents` bucket
   - If not, create it: click "New Bucket" → name: `documents` → Public: OFF

2. **Check file size limits:**
   - Free tier: Max 100MB per file
   - If larger: Split into smaller chunks or upgrade plan

3. **Check file path format:**
   ```typescript
   // RIGHT ✓
   const filePath = `${userId}/vault/${fileName}`;
   await supabase.storage.from('documents').upload(filePath, file);

   // WRONG ❌
   const filePath = fileName;  // Storage policies need proper path structure
   ```

4. **Verify storage RLS policies:**
   - Supabase Dashboard → Storage → documents bucket → Policies
   - Should see policies for INSERT, SELECT, DELETE
   - If empty, re-run storage policy SQL commands

5. **Check CORS settings (if accessing from different domain):**
   - Supabase Dashboard → Settings → API
   - Look for CORS configuration
   - Should include your domain

---

### Problem: "Can't download or view uploaded file"

**Symptoms:**
- File uploaded successfully but can't access it
- File URL is broken

**Solution:**

1. **Use signed URLs for private buckets:**
   ```typescript
   // Get signed URL (valid for 24 hours)
   const { data } = await supabase.storage
     .from('documents')
     .createSignedUrl(filePath, 60 * 60 * 24);

   const signedUrl = data?.signedUrl;
   ```

2. **Check file actually exists:**
   - Supabase Dashboard → Storage → documents bucket
   - Browse files
   - Verify file path matches what you uploaded

3. **Check RLS policies allow download:**
   ```sql
   -- Policy must allow SELECT
   CREATE POLICY "Users can view their documents"
   ON storage.objects
   FOR SELECT
   USING (
     bucket_id = 'documents'
     AND auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

---

## SQL & Database Schema

### Problem: "Table does not exist"

**Symptoms:**
- Error: `relation "users" does not exist`
- Query fails immediately

**Solution:**

1. **Verify table was created:**
   - Supabase Dashboard → SQL Editor
   - Click "Run recent queries"
   - Look for CREATE TABLE queries
   - Check all returned "Success"

2. **Check table name is correct:**
   - Table names are case-sensitive in PostgreSQL
   - Use lowercase: `users`, not `Users`
   - Check query: `SELECT * FROM users;` works
   - But: `SELECT * FROM Users;` fails

3. **Re-create table:**
   - If table is missing, paste SQL again
   - Supabase Dashboard → SQL Editor → New Query
   - Paste CREATE TABLE commands
   - Click "Run"

4. **Check table in dashboard:**
   - Supabase Dashboard → Tables section (left sidebar)
   - Should see: users, vaults, documents
   - If empty, tables weren't created

---

### Problem: "Invalid or missing column"

**Symptoms:**
- Error: `column "first_name" does not exist`
- Column names don't match schema

**Solution:**

1. **Check column name spelling:**
   - Schema uses: `first_name` (with underscore)
   - Not: `firstName` (camelCase)
   - Always use snake_case in database

2. **Verify all columns exist:**
   ```sql
   -- See all columns in a table
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'users';
   ```

3. **Add missing column:**
   ```sql
   ALTER TABLE users ADD COLUMN county VARCHAR(255);
   ```

---

## TypeScript & Type Errors

### Problem: TypeScript errors about Supabase types

**Symptoms:**
- Error: `Cannot find module '@supabase/supabase-js'`
- Type errors in editor

**Solution:**

1. **Install Supabase package:**
   ```bash
   npm install @supabase/supabase-js
   npm install --save-dev @supabase/auth-helpers-nextjs
   ```

2. **Generate types from your database:**
   ```bash
   npx supabase gen types typescript --project-id xxxxx > types/supabase.ts
   ```

3. **Import types in your code:**
   ```typescript
   import { Database } from '@/types/supabase';

   type Users = Database['public']['Tables']['users']['Row'];
   ```

---

## Performance Issues

### Problem: "App is slow" or "Queries are slow"

**Symptoms:**
- Page takes 5+ seconds to load
- Database queries take long time

**Solution:**

1. **Check indexes exist:**
   ```sql
   -- Verify indexes
   SELECT * FROM pg_indexes WHERE tablename = 'vaults';
   ```

2. **Add missing indexes:**
   ```sql
   CREATE INDEX idx_vaults_user_id ON vaults(user_id);
   CREATE INDEX idx_documents_vault_id ON documents(vault_id);
   ```

3. **Limit query results:**
   ```typescript
   // SLOW ❌ - Gets 1000s of rows
   const { data } = await supabase.from('documents').select('*');

   // FAST ✓ - Gets only 10 rows
   const { data } = await supabase
     .from('documents')
     .select('*')
     .limit(10);
   ```

4. **Use pagination:**
   ```typescript
   const pageSize = 20;
   const page = 1;
   const offset = (page - 1) * pageSize;

   const { data } = await supabase
     .from('vaults')
     .select('*')
     .range(offset, offset + pageSize - 1);
   ```

5. **Check database logs:**
   - Supabase Dashboard → Settings → Logs
   - Look for slow queries
   - Optimize with indexes

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `PGRST301` | RLS policy denies access | Check user owns the data |
| `42P01` | Table doesn't exist | Re-create table with SQL |
| `42703` | Column doesn't exist | Check column name spelling |
| `23505` | Duplicate key (unique constraint) | Email already registered |
| `23503` | Foreign key constraint | Reference doesn't exist |
| `Invalid login credentials` | Wrong email/password | Check credentials |
| `Email not confirmed` | Email verification required | Click email confirmation link |
| `User already exists` | Email already has account | Use different email |
| `Auth session missing` | User not authenticated | Log in first |
| `Storage bucket does not exist` | Bucket not created | Create bucket named `documents` |

---

## Debugging Tools

### Enable Debug Logging

```typescript
// In your supabaseClient.ts
if (process.env.NODE_ENV === 'development') {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event);
    console.log('Session:', session);
  });
}
```

### Test Queries in Dashboard

1. Go to SQL Editor in Supabase
2. Write test queries
3. Run them to verify they work
4. Copy working queries to your app

### Browser DevTools

```javascript
// In browser console
// Check current session
await supabase.auth.getSession();

// Check current user
await supabase.auth.getUser();

// Test a query
await supabase.from('users').select('*').limit(1);
```

---

## Getting Help

### When stuck:

1. **Check the Supabase documentation:**
   - https://supabase.com/docs

2. **Search Supabase Discord community:**
   - https://discord.supabase.io

3. **Check your browser console:**
   - DevTools → Console tab
   - Look for red error messages

4. **Check Supabase project logs:**
   - Supabase Dashboard → Logs section

5. **Test with simple queries first:**
   - Don't try complex operations
   - Verify basic connectivity works

---

## Checklist Before Going to Production

- [ ] All environment variables are set correctly
- [ ] `.env.local` is in `.gitignore`
- [ ] Never commit `.env.local` to Git
- [ ] RLS policies are correct and tested
- [ ] Users can only see their own data
- [ ] Service Role Key is never exposed in browser
- [ ] Storage bucket is created and RLS policies set
- [ ] All tables are created with correct schema
- [ ] All indexes are created for performance
- [ ] Email verification is enabled (for security)
- [ ] Backups are configured in Supabase
- [ ] Rate limiting is considered
- [ ] CORS is configured correctly

---

## Summary

Most Supabase issues are caused by:
1. **Missing/wrong environment variables** (restart server after changes!)
2. **RLS policies not set up** (user sees no data or "permission denied")
3. **Tables not created** (SQL queries didn't run successfully)
4. **Storage bucket not created** (file upload fails)
5. **Wrong column/table names** (check spelling and case)

When debugging:
1. Check environment variables first
2. Test in Supabase dashboard SQL Editor
3. Check browser console for errors
4. Verify RLS policies with test queries
5. Ask in Supabase Discord if stuck

You've got this! 🚀
