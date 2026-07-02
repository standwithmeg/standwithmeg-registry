# Stand With Meg - Supabase Setup Guide

A step-by-step guide to set up Supabase for the Stand With Meg pro se legal platform. This guide is designed for non-technical founders and covers everything from initial setup to database configuration.

**Estimated Time:** 30-45 minutes

---

## Overview

Supabase will serve as the backend database for Stand With Meg, storing:
- User accounts and subscription information
- Document vaults (case-specific folders)
- Uploaded legal documents
- File storage for documents

By the end of this guide, you'll have:
- A Supabase project with a configured database
- Proper security settings (Row Level Security)
- Environment variables set up in your Next.js project
- Ready-to-use tables for users, vaults, and documents

---

## Part 1: Create a Supabase Account and Project

### Step 1.1: Sign Up for Supabase

1. Go to **https://supabase.com**
2. Click **"Sign Up"** in the top right corner
3. Choose to sign up with:
   - Email and password, OR
   - GitHub account (recommended - easier)
4. Follow the verification steps
5. You'll be taken to the dashboard

### Step 1.2: Create Your First Project

1. In the Supabase dashboard, click **"New Project"** (or "Create a new project")
2. Fill in the project details:
   - **Name:** `stand-with-meg` (or your preferred name)
   - **Database Password:** Create a strong password (save this somewhere secure)
   - **Region:** Select the region closest to your users (e.g., `us-east-1` for US)
   - **Pricing Plan:** Start with "Free" tier (sufficient for development)
3. Click **"Create new project"**
4. Wait 2-3 minutes for the project to initialize (you'll see a loading screen)

### Step 1.3: Wait for Project Initialization

Once created, you'll see the project dashboard. The database is being set up in the background. You'll know it's ready when:
- The "SQL Editor" becomes clickable in the left sidebar
- You see tables listed (though they'll be empty at first)

---

## Part 2: Get Your API Keys

### Step 2.1: Access the API Settings

1. In your Supabase project dashboard, look for the left sidebar
2. Click on **"Settings"** (gear icon) at the bottom of the left sidebar
3. Click on **"API"** in the submenu

### Step 2.2: Find Your Three API Keys

You'll see the API section with these values:

**You need to copy these THREE values:**

1. **NEXT_PUBLIC_SUPABASE_URL** (called "Project URL")
   - Looks like: `https://xxxxxxxxxxxxx.supabase.co`
   - This is public and safe to share
   - Click the copy icon next to it

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY** (called "anon public")
   - Found under "Project API keys"
   - Looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (very long)
   - This is public and used by the browser
   - Click the copy icon

3. **SUPABASE_SERVICE_ROLE_KEY** (called "service_role secret")
   - Found under "Project API keys" (scroll down if needed)
   - Looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (very long)
   - ⚠️ **KEEP THIS SECRET** - never share or expose this
   - Only used on your server
   - Click the copy icon

**Save all three values somewhere temporarily** (notepad, 1Password, etc.)

---

## Part 3: Set Up Environment Variables

### Step 3.1: Update .env.local

1. Open the file: `/standwithmeg/.env.local`
2. Find these three lines (they should be empty or have placeholders):
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```

3. Paste the values you copied from Supabase:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

4. Save the file

### Step 3.2: Verify the Environment Variables

In your terminal, run:
```bash
cat .env.local | grep SUPABASE
```

You should see all three variables with values (not empty). If they're empty, go back and re-paste.

---

## Part 4: Create Database Tables

### Step 4.1: Access the SQL Editor

1. Go back to your Supabase project dashboard
2. In the left sidebar, click **"SQL Editor"**
3. Click **"New Query"** button (top left)
4. You'll see a blank SQL editor window

### Step 4.2: Create the Users Table

Copy and paste this SQL into the editor:

```sql
-- Create the users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  state VARCHAR(2),
  county VARCHAR(255),
  case_types TEXT[], -- Array of case types (e.g., ['divorce', 'custody', 'property'])
  plan VARCHAR(50) DEFAULT 'free', -- 'free', 'basic', 'premium'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on email for faster lookups
CREATE INDEX idx_users_email ON users(email);
```

1. Click **"Run"** button (or press Cmd+Enter on Mac, Ctrl+Enter on Windows)
2. You should see "Success" message
3. You can now close this query

### Step 4.3: Create the Vaults Table

Click **"New Query"** again and paste:

```sql
-- Create the vaults table (case folders)
CREATE TABLE vaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50), -- e.g., 'divorce', 'custody', 'property', 'contract'
  case_number VARCHAR(100),
  court VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX idx_vaults_user_id ON vaults(user_id);
CREATE INDEX idx_vaults_created_at ON vaults(created_at);
```

Click **"Run"** and wait for success.

### Step 4.4: Create the Documents Table

Click **"New Query"** again and paste:

```sql
-- Create the documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50), -- e.g., 'pdf', 'docx', 'image', 'spreadsheet'
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  file_size BIGINT, -- Size in bytes
  file_url VARCHAR(500), -- Path to file in Supabase Storage
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX idx_documents_vault_id ON documents(vault_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_created_at ON documents(created_at);
```

Click **"Run"** and wait for success.

---

## Part 5: Set Up Row Level Security (RLS)

Row Level Security (RLS) ensures users can **only see and access their own data**. This is critical for security.

### Step 5.1: Enable RLS on Each Table

1. Go to the left sidebar and click **"Authentication"**
2. Click on **"Policies"** (or go to "Settings" > "Auth" and find "Policies")
3. You should see a list of tables. For each table (users, vaults, documents), click on it and enable RLS

**Or manually via SQL:**

Click **"New Query"** and paste:

```sql
-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

Click **"Run"**.

### Step 5.2: Create RLS Policy for Users Table

Click **"New Query"** and paste:

```sql
-- Users can see their own user record
CREATE POLICY "Users can view their own user record"
ON users
FOR SELECT
USING (auth.uid() = id);

-- Users can update their own user record
CREATE POLICY "Users can update their own user record"
ON users
FOR UPDATE
USING (auth.uid() = id);
```

Click **"Run"**.

### Step 5.3: Create RLS Policies for Vaults Table

Click **"New Query"** and paste:

```sql
-- Users can see their own vaults
CREATE POLICY "Users can view their own vaults"
ON vaults
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create vaults
CREATE POLICY "Users can create vaults"
ON vaults
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own vaults
CREATE POLICY "Users can update their own vaults"
ON vaults
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own vaults
CREATE POLICY "Users can delete their own vaults"
ON vaults
FOR DELETE
USING (auth.uid() = user_id);
```

Click **"Run"**.

### Step 5.4: Create RLS Policies for Documents Table

Click **"New Query"** and paste:

```sql
-- Users can see documents in their vaults
CREATE POLICY "Users can view documents in their vaults"
ON documents
FOR SELECT
USING (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
);

-- Users can upload documents to their vaults
CREATE POLICY "Users can upload documents to their vaults"
ON documents
FOR INSERT
WITH CHECK (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
  AND uploaded_by = auth.uid()
);

-- Users can update documents in their vaults
CREATE POLICY "Users can update documents in their vaults"
ON documents
FOR UPDATE
USING (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
);

-- Users can delete documents in their vaults
CREATE POLICY "Users can delete documents in their vaults"
ON documents
FOR DELETE
USING (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
);
```

Click **"Run"**.

---

## Part 6: Set Up Supabase Storage for File Uploads

Supabase Storage allows users to upload and store documents securely.

### Step 6.1: Create Storage Bucket

1. In the left sidebar, click **"Storage"**
2. Click **"Create a new bucket"** (or the "+" button)
3. Fill in the details:
   - **Bucket name:** `documents`
   - **Public bucket:** Leave **UNCHECKED** (we want private storage)
   - Click **"Create bucket"**

### Step 6.2: Set Storage RLS Policies

Supabase Storage also uses RLS. Let's set policies so users can only access their own files.

1. Click on the `documents` bucket you just created
2. Click the **"Policies"** tab
3. Click **"Create policy"** or use the SQL editor

**Via SQL Editor:**

Click **"New Query"** in the SQL Editor and paste:

```sql
-- Users can upload files to the documents bucket
CREATE POLICY "Users can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view documents they uploaded
CREATE POLICY "Users can view their documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their documents
CREATE POLICY "Users can delete their documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

Click **"Run"**.

---

## Part 7: Test the Connection

### Step 7.1: Test from Your Next.js App

1. Open your terminal and navigate to the project:
   ```bash
   cd /path/to/standwithmeg
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 in your browser

### Step 7.2: Manual Connection Test

Create a test script to verify the connection works. In your terminal, run:

```bash
node -e "
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
console.log('URL:', url ? '✓ Set' : '✗ Missing');
console.log('Anon Key:', key ? '✓ Set' : '✗ Missing');
"
```

Both should show "✓ Set".

---

## Part 8: Database Schema Reference

Here's a quick reference for what you've created:

### Users Table
```
id                 UUID (Primary Key)
email              VARCHAR(255) - Unique email address
first_name         VARCHAR(255) - User's first name
last_name          VARCHAR(255) - User's last name
state              VARCHAR(2) - State abbreviation (e.g., 'CA', 'NY')
county             VARCHAR(255) - County name
case_types         TEXT[] - Array of case types (e.g., ['divorce', 'custody'])
plan               VARCHAR(50) - Subscription plan (free, basic, premium)
created_at         TIMESTAMP - Account creation date
updated_at         TIMESTAMP - Last update date
```

### Vaults Table
```
id                 UUID (Primary Key)
user_id            UUID (Foreign Key) - Links to users table
name               VARCHAR(255) - Vault name (e.g., "Smith vs. Jones Divorce")
type               VARCHAR(50) - Case type (divorce, custody, etc.)
case_number        VARCHAR(100) - Court case number
court              VARCHAR(255) - Court name/location
created_at         TIMESTAMP - Vault creation date
updated_at         TIMESTAMP - Last update date
```

### Documents Table
```
id                 UUID (Primary Key)
vault_id           UUID (Foreign Key) - Links to vaults table
name               VARCHAR(255) - Document filename
type               VARCHAR(50) - File type (pdf, docx, etc.)
uploaded_by        UUID (Foreign Key) - Links to users table
uploaded_at        TIMESTAMP - Upload date/time
file_size          BIGINT - File size in bytes
file_url           VARCHAR(500) - Path to file in storage
description        TEXT - Optional document description
created_at         TIMESTAMP - Record creation date
updated_at         TIMESTAMP - Last update date
```

---

## Part 9: Troubleshooting

### Problem: "Failed to connect to database"

**Solution:**
- Verify all three environment variables are correctly set in `.env.local`
- Make sure there are no extra spaces or quotes around the values
- Restart your Next.js development server after updating .env.local

### Problem: "Permission denied" errors

**Solution:**
- Ensure RLS policies are created correctly
- Check that `auth.uid()` is being used in policies (not hardcoded IDs)
- Make sure users are authenticated before accessing protected tables

### Problem: "Table does not exist"

**Solution:**
- Go to SQL Editor and run the CREATE TABLE queries again
- Check that all queries returned "Success"
- Refresh the Supabase dashboard

### Problem: Storage bucket not accessible

**Solution:**
- Verify the bucket is named `documents` (exactly)
- Check that RLS policies are created for the storage bucket
- Ensure files are uploaded to paths like `user_id/filename`

---

## Part 10: Next Steps

Once setup is complete:

1. **Create a Supabase client in your Next.js app:**
   - Create `/lib/supabaseClient.ts` to initialize the Supabase client
   - Use this in your signup, login, and vault management pages

2. **Set up authentication:**
   - Configure Supabase Auth to handle user registration and login
   - Use the `auth.uid()` from authenticated sessions in your policies

3. **Build signup flow:**
   - Create a signup form that saves user data to the `users` table
   - Verify email addresses via Supabase Auth

4. **Build vault creation:**
   - Allow users to create new vaults
   - Store vault data in the `vaults` table

5. **Build document upload:**
   - Implement file upload functionality using Supabase Storage
   - Save document metadata in the `documents` table

---

## Security Checklist

Before going to production:

- [ ] All environment variables are set correctly
- [ ] `.env.local` is in `.gitignore` (never commit sensitive keys)
- [ ] Row Level Security (RLS) is enabled on all tables
- [ ] RLS policies only allow users to access their own data
- [ ] Storage bucket RLS policies are configured
- [ ] Database password is strong and saved securely (not in code)
- [ ] Service Role Key is only used on the server (never in browser)
- [ ] ANON key is used for browser-based requests (safe to expose)
- [ ] Regular backups are configured in Supabase settings

---

## Useful Resources

- **Supabase Documentation:** https://supabase.com/docs
- **Supabase Dashboard:** https://app.supabase.com
- **SQL Reference:** https://www.postgresql.org/docs/current/sql.html
- **Row Level Security Guide:** https://supabase.com/docs/guides/auth/row-level-security

---

## Summary

You've now set up:
- ✓ Supabase project with API keys
- ✓ Three database tables (users, vaults, documents)
- ✓ Row Level Security policies for data protection
- ✓ Storage bucket for document uploads
- ✓ Environment variables in your Next.js project

Your Stand With Meg backend is ready for development! The next step is to create the authentication flow and connect your frontend to these tables.
