# Stand With Meg - Getting Started with Supabase

**Start here! A simple guide to get Supabase running in 30 minutes.**

---

## What You're About to Do

You're going to set up Supabase, which is the **backend database** for Stand With Meg. This will allow:
- Users to create accounts
- Users to organize documents into case vaults
- Users to upload legal documents securely
- Each user to only see their own data

---

## Prerequisites

- 30 minutes of time
- A web browser
- Your Stand With Meg project open
- Access to `.env.local` file in the project

---

## The 3-Step Process

```
1. GET KEYS FROM SUPABASE
   └─ Create account → Create project → Copy 3 keys

2. PASTE KEYS INTO YOUR PROJECT
   └─ Add to .env.local → Restart server

3. CREATE DATABASE
   └─ Run SQL commands → Create tables → Set up security
```

---

## Step 1: Get Keys from Supabase (10 minutes)

### 1.1 Go to Supabase Website
- Open https://supabase.com in your browser
- Click **"Sign Up"** (top right)
- Use email or GitHub to sign up

### 1.2 Create a Project
- After signing in, click **"New Project"**
- Fill in:
  - **Name:** `stand-with-meg`
  - **Password:** Create a strong password (save somewhere safe)
  - **Region:** Pick closest to you (e.g., `us-east-1`)
  - **Pricing:** Click "Free" (not Pro)
- Click **"Create new project"**
- Wait 2-3 minutes...

### 1.3 Get Your Three Keys
When project loads, go to **Settings** (gear icon, bottom of left sidebar)
- Click **"API"**

You'll see:
1. **Project URL** (looks like `https://xxxxx.supabase.co`)
   - Copy this → Keep it

2. Under "Project API keys", find **"anon public"**
   - Copy this → Keep it

3. Under "Project API keys", find **"service_role secret"** (might need to scroll)
   - Copy this → Keep it (don't share!)

**You now have 3 keys. Don't close this page yet!**

---

## Step 2: Add Keys to Your Project (5 minutes)

### 2.1 Open .env.local File
In your project folder, find and open the file: `.env.local`

You'll see:
```
# Supabase (we'll set this up next)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### 2.2 Paste Your Keys
Replace the empty values with your 3 keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important:**
- Don't add quotes around the values
- Don't add spaces before/after the `=`
- Save the file

### 2.3 Restart Your Server
In your terminal:
1. Press **Ctrl+C** (stop the server)
2. Type: `npm run dev`
3. Press **Enter** (start server again)

**Done with keys!** ✓

---

## Step 3: Create Database (15 minutes)

Now you need to create the database tables where data will be stored.

### 3.1 Open SQL Editor
Go back to your Supabase dashboard (https://app.supabase.com)
- On the left side, click **"SQL Editor"**
- Click **"New Query"**

### 3.2 Create Tables
You'll see a blank text area. Copy and paste this SQL:

```sql
-- Create the users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  state VARCHAR(2),
  county VARCHAR(255),
  case_types TEXT[],
  plan VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- Create the vaults table
CREATE TABLE vaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  case_number VARCHAR(100),
  court VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vaults_user_id ON vaults(user_id);
CREATE INDEX idx_vaults_created_at ON vaults(created_at);

-- Create the documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  file_size BIGINT,
  file_url VARCHAR(500),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_vault_id ON documents(vault_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_created_at ON documents(created_at);
```

Then click **"Run"** button (or Cmd+Enter on Mac, Ctrl+Enter on Windows)

**You should see "Success"** ✓

### 3.3 Enable Security (Row Level Security)
Create a **new query** and paste:

```sql
-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

Click **"Run"**

### 3.4 Add Security Policies
Create a **new query** for each block below and click "Run" each time:

**Block 1 - Users Table:**
```sql
CREATE POLICY "Users can view their own user record"
ON users
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own user record"
ON users
FOR UPDATE
USING (auth.uid() = id);
```

**Block 2 - Vaults Table:**
```sql
CREATE POLICY "Users can view their own vaults"
ON vaults
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create vaults"
ON vaults
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vaults"
ON vaults
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vaults"
ON vaults
FOR DELETE
USING (auth.uid() = user_id);
```

**Block 3 - Documents Table:**
```sql
CREATE POLICY "Users can view documents in their vaults"
ON documents
FOR SELECT
USING (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can upload documents to their vaults"
ON documents
FOR INSERT
WITH CHECK (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
  AND uploaded_by = auth.uid()
);

CREATE POLICY "Users can update documents in their vaults"
ON documents
FOR UPDATE
USING (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete documents in their vaults"
ON documents
FOR DELETE
USING (
  vault_id IN (
    SELECT id FROM vaults WHERE user_id = auth.uid()
  )
);
```

### 3.5 Create Storage Bucket for Files
- Go to **"Storage"** (left sidebar of Supabase)
- Click **"Create a new bucket"**
- Name it: `documents`
- Make sure **"Public bucket"** is UNCHECKED
- Click **"Create bucket"**

**Done with database!** ✓

---

## What You've Just Done

✓ Created a Supabase project
✓ Got 3 API keys
✓ Added keys to your project
✓ Created 3 database tables (users, vaults, documents)
✓ Set up security (Row Level Security)
✓ Created a file storage bucket

**Your backend is now ready!**

---

## What This Means

**Users Table**
- Stores user accounts (email, name, state, etc.)
- Each user can only see their own record

**Vaults Table**
- Stores case folders for each user
- A user with "Smith v. Jones Divorce" case has one vault
- Each user can only see their own vaults

**Documents Table**
- Stores uploaded legal documents
- Each document belongs to a vault
- Users can only see documents in their own vaults

**Storage Bucket**
- Actual files (PDFs, Word docs, images)
- Users can only access their own files

**Security (RLS)**
- Even if someone hacks the database, they can't see other users' data
- Each query automatically filters to show only the current user's data

---

## Next: Build Your App

Now that the backend is ready, you need to:

1. **Create signup/login pages** (users table)
2. **Create vault management** (vaults table)
3. **Create document upload** (documents table + storage)

For code examples and detailed instructions, see:
- **SUPABASE_NEXT_INTEGRATION.md** (Code examples)
- **SUPABASE_QUICK_REFERENCE.md** (SQL commands)

---

## If Something Goes Wrong

See **SUPABASE_TROUBLESHOOTING.md** for common issues and solutions.

Common problems:
- "Supabase URL is undefined" → Restart your server
- "Table does not exist" → Re-run CREATE TABLE SQL
- "Permission denied" → Check RLS policies
- "Can't upload file" → Create storage bucket

---

## Key Things to Remember

1. **Never commit `.env.local` to Git**
   - Add to `.gitignore` (it usually is already)
   - Your API keys must stay secret

2. **Restart Next.js after changing `.env.local`**
   - Stop server (Ctrl+C)
   - Start again (npm run dev)

3. **Keep your Service Role Key SECRET**
   - Never expose it in your app
   - Only use on the server
   - Treat it like a password

4. **ANON key is safe to expose**
   - It's in your browser anyway
   - RLS policies protect your data

5. **Test in Supabase Dashboard**
   - Use SQL Editor to test queries
   - Before writing code

---

## Congratulations! 🎉

You now have a professional-grade backend for Stand With Meg. Your database is:
- Secure (RLS prevents unauthorized access)
- Scalable (handles thousands of users)
- Reliable (automatic backups)
- Cost-effective (free tier until you scale)

**Next step:** Read SUPABASE_NEXT_INTEGRATION.md to start building!

---

## Quick Links

- **Supabase Dashboard:** https://app.supabase.com
- **Supabase Docs:** https://supabase.com/docs
- **Stand With Meg Docs:** See README_SUPABASE.md
- **Questions?** Check SUPABASE_TROUBLESHOOTING.md

---

**You've got this! Good luck! 🚀**
