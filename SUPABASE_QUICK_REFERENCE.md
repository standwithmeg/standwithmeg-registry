# Stand With Meg - Supabase Quick Reference

A quick checklist and reference guide for Supabase setup and common tasks.

---

## Setup Checklist

- [ ] **Step 1:** Sign up at https://supabase.com
- [ ] **Step 2:** Create a new project (name: `stand-with-meg`)
- [ ] **Step 3:** Copy three API keys from Settings > API:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **Step 4:** Paste keys into `.env.local`
- [ ] **Step 5:** Create tables using SQL Editor:
  - [ ] Users table
  - [ ] Vaults table
  - [ ] Documents table
- [ ] **Step 6:** Enable RLS on all tables
- [ ] **Step 7:** Create RLS policies for all tables
- [ ] **Step 8:** Create storage bucket named `documents`
- [ ] **Step 9:** Create storage RLS policies
- [ ] **Step 10:** Test connection

---

## Database Tables - SQL Commands

### Create All Tables at Once

Copy this entire SQL block into a single new query and run it:

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

---

## Enable RLS - SQL Commands

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

---

## RLS Policies - SQL Commands

### Users Table Policies

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

### Vaults Table Policies

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

### Documents Table Policies

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

---

## Storage Policies - SQL Commands

```sql
CREATE POLICY "Users can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## Environment Variables Template

Add to `.env.local`:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Useful SQL Queries

### View All Users
```sql
SELECT id, email, first_name, last_name, plan, created_at
FROM users
ORDER BY created_at DESC;
```

### View All Vaults for a User
```sql
SELECT id, name, type, case_number, created_at
FROM vaults
WHERE user_id = 'USER_ID_HERE'
ORDER BY created_at DESC;
```

### View All Documents in a Vault
```sql
SELECT id, name, type, file_size, uploaded_at
FROM documents
WHERE vault_id = 'VAULT_ID_HERE'
ORDER BY uploaded_at DESC;
```

### Count Users by Plan
```sql
SELECT plan, COUNT(*) as count
FROM users
GROUP BY plan;
```

### Delete All User Data (Cascades to vaults and documents)
```sql
DELETE FROM users WHERE id = 'USER_ID_HERE';
```

---

## Common Supabase Dashboard Locations

| Task | Path |
|------|------|
| API Keys | Settings → API |
| SQL Editor | SQL Editor (left sidebar) |
| Tables | Database (left sidebar) |
| Row Level Security | Authentication → Policies |
| Storage Buckets | Storage (left sidebar) |
| Auth Settings | Authentication → Providers |
| Backups | Settings → Backups |
| Project URL | Settings → API (Project URL field) |

---

## API Key Security Rules

| Key | Public? | Where to Use | What It Allows |
|-----|---------|--------------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser & Server | Basic connection info |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser only | Read/write based on RLS policies |
| `SUPABASE_SERVICE_ROLE_KEY` | No ❌ | Server only | Full access (bypasses RLS) |

---

## Table Column Types Reference

| Type | Example | Use For |
|------|---------|---------|
| UUID | `550e8400-e29b-41d4-a716-446655440000` | Unique IDs (primary keys) |
| VARCHAR(255) | `John Smith` | Text with size limit |
| TEXT | Long documents | Unlimited text |
| TEXT[] | `['divorce', 'custody']` | Lists/arrays |
| BIGINT | `1048576` | Large numbers (file sizes) |
| TIMESTAMP | `2026-03-26 14:30:00` | Dates and times |
| BOOLEAN | `true` or `false` | Yes/no values |

---

## Troubleshooting Matrix

| Problem | Check | Solution |
|---------|-------|----------|
| Tables don't exist | SQL Editor | Re-run CREATE TABLE queries |
| Connection fails | `.env.local` | Verify all 3 keys are set correctly |
| "Permission denied" | RLS Policies | Check policies use `auth.uid()` |
| Can't upload files | Storage bucket | Create bucket named `documents` |
| Storage policies error | SQL Editor | Re-run storage policy queries |
| Users see other's data | RLS | Policies should filter by `auth.uid()` |

---

## Next.js Integration Checklist

- [ ] Install `@supabase/supabase-js`: `npm install @supabase/supabase-js`
- [ ] Create `/lib/supabaseClient.ts` file
- [ ] Initialize Supabase client with URL and anon key
- [ ] Import and use in components
- [ ] Test authentication flow
- [ ] Test table read/write operations
- [ ] Test file upload to storage
- [ ] Verify RLS policies work

---

## Useful Supabase Resources

- **Dashboard:** https://app.supabase.com
- **Docs:** https://supabase.com/docs
- **SQL Reference:** https://www.postgresql.org/docs/current/
- **RLS Guide:** https://supabase.com/docs/guides/auth/row-level-security
- **Storage Guide:** https://supabase.com/docs/guides/storage
- **Auth Guide:** https://supabase.com/docs/guides/auth

---

## Quick Start Summary

1. **Sign up** at supabase.com
2. **Create project** (name: stand-with-meg)
3. **Copy 3 API keys** from Settings > API
4. **Paste into** `.env.local`
5. **Run SQL** in SQL Editor to create tables
6. **Enable RLS** on all tables
7. **Create policies** for each table
8. **Create storage** bucket named documents
9. **Test** connection from your app
10. **Done!** Your backend is ready

---

Last Updated: 2026-03-26
