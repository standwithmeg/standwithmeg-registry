# Stand With Meg - Supabase Architecture

Visual guide to the database structure, relationships, and security model.

---

## Database Schema Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     STAND WITH MEG DATABASE                     │
└─────────────────────────────────────────────────────────────────┘

                          ┌──────────────┐
                          │    USERS     │
                          ├──────────────┤
                          │ id (PK)      │◄──────────────┐
                          │ email        │               │
                          │ first_name   │               │
                          │ last_name    │               │
                          │ state        │               │
                          │ county       │               │
                          │ case_types[] │               │
                          │ plan         │               │
                          │ created_at   │               │
                          │ updated_at   │               │
                          └──────────────┘               │
                                 ▲                      │
                                 │                      │
                    ┌────────────┴────────────┐        │
                    │                         │        │
                    │ (one user has           │        │
                    │  many vaults)           │        │
                    │                         │        │
              ┌─────▼──────────┐      ┌──────▼──────────┐
              │     VAULTS     │      │   DOCUMENTS     │
              ├────────────────┤      ├─────────────────┤
              │ id (PK)        │      │ id (PK)         │
              │ user_id (FK)   │◄─────┤ vault_id (FK)   │
              │ name           │      │ name            │
              │ type           │      │ type            │
              │ case_number    │      │ uploaded_by(FK) │
              │ court          │      │ uploaded_at     │
              │ created_at     │      │ file_size       │
              │ updated_at     │      │ file_url        │
              └────────────────┘      │ description     │
                                      │ created_at      │
                                      │ updated_at      │
                                      └─────────────────┘

Legend:
  PK = Primary Key (unique identifier)
  FK = Foreign Key (reference to another table)
```

---

## Data Relationships

### User → Vault Relationship
```
One User has Many Vaults

User (John Smith)
├── Vault 1: "Smith v. Jones Divorce"
│   └── Case Type: Divorce
│   └── Case Number: 2024-CV-001
│
├── Vault 2: "Custody Dispute"
│   └── Case Type: Custody
│   └── Case Number: 2024-FAM-045
│
└── Vault 3: "Property Settlement"
    └── Case Type: Property
    └── Case Number: 2024-CV-089
```

### Vault → Document Relationship
```
One Vault has Many Documents

Vault: "Smith v. Jones Divorce"
├── Document: "Complaint.pdf"
│   └── Uploaded: 2026-03-15
│   └── Size: 1.2 MB
│
├── Document: "Declaration_of_Assets.pdf"
│   └── Uploaded: 2026-03-16
│   └── Size: 850 KB
│
├── Document: "Spouse_Response.pdf"
│   └── Uploaded: 2026-03-18
│   └── Size: 1.5 MB
│
└── Document: "Settlement_Agreement.docx"
    └── Uploaded: 2026-03-20
    └── Size: 2.1 MB
```

---

## User Data Privacy - Row Level Security (RLS)

### The Problem Without RLS
```
Without RLS, anyone could query the database and see:
- All users' email addresses
- All vaults for all users
- All documents from all users
- Sensitive case information

❌ INSECURE - User B could see User A's data
```

### The Solution With RLS
```
With RLS policies, users can only see their own data:

User A (john@example.com)
├── Can only see: Their own user record
├── Can only see: Their own vaults (3 vaults)
├── Can only see: Documents in their vaults
└── Cannot see: Any other user's information

User B (jane@example.com)
├── Can only see: Their own user record
├── Can only see: Their own vaults (2 vaults)
├── Can only see: Documents in their vaults
└── Cannot see: Any other user's information

✓ SECURE - Each user is isolated
```

### How RLS Policies Work

```
When User A tries to access the USERS table:

User A sends: SELECT * FROM users

Supabase checks: auth.uid() = id?
                 (Is the user ID equal to the user_id in the record?)

Result:
  ✓ User A's own record → VISIBLE (auth.uid matches id)
  ✗ User B's record → HIDDEN (auth.uid doesn't match id)
  ✗ User C's record → HIDDEN (auth.uid doesn't match id)
```

---

## API Keys & Their Permissions

### NEXT_PUBLIC_SUPABASE_URL
```
What it is:      The URL of your Supabase project
Looks like:      https://xxxxxxxxxxxxx.supabase.co
Public?          YES (safe to expose)
Where to use:    Browser and server
Permissions:     None (just connection info)
```

### NEXT_PUBLIC_SUPABASE_ANON_KEY
```
What it is:      Anonymous key (for public/browser access)
Looks like:      eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Public?          YES (safe to expose)
Where to use:    Browser (Next.js client components)
Permissions:     Uses RLS policies to filter data
Example:         User can only see their own vaults
```

### SUPABASE_SERVICE_ROLE_KEY
```
What it is:      Secret key (for server access)
Looks like:      eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Public?          NO ❌ KEEP SECRET
Where to use:    Server only (Next.js API routes)
Permissions:     Full access (BYPASSES RLS)
Warning:         If exposed, anyone can access all data
```

---

## Storage Architecture

### File Organization in Supabase Storage

```
Bucket: "documents"

documents/
├── user_id_123/
│   ├── vault_id_abc/
│   │   ├── complaint.pdf
│   │   ├── declaration.pdf
│   │   └── agreement.docx
│   │
│   └── vault_id_def/
│       ├── custody_order.pdf
│       └── mediation_notes.txt
│
├── user_id_456/
│   ├── vault_id_xyz/
│   │   └── property_deed.pdf
│
└── user_id_789/
    └── vault_id_uvw/
        ├── complaint.pdf
        ├── response.pdf
        └── settlement.pdf

Storage RLS enforces:
  User 123 can only access: documents/user_id_123/*
  User 456 can only access: documents/user_id_456/*
  User 789 can only access: documents/user_id_789/*
```

---

## Query Examples & RLS Filtering

### Example 1: User Viewing Their Vaults

```sql
-- User A sends this query:
SELECT * FROM vaults WHERE user_id = auth.uid();

-- But Supabase RLS AUTOMATICALLY applies this:
SELECT * FROM vaults
WHERE user_id = 'user_a_uuid'  -- auth.uid() is user A
AND user_id = auth.uid();       -- RLS policy

-- Result: User A sees only their vaults
```

### Example 2: Attempted Data Breach

```sql
-- User A tries to see User B's data:
SELECT * FROM vaults WHERE user_id = 'user_b_uuid';

-- Supabase RLS blocks it:
Supabase checks: user_id = auth.uid()?
                 'user_b_uuid' = 'user_a_uuid'?
                 NO ❌

-- Result: No rows returned, breach prevented
```

### Example 3: User Creating a New Document

```sql
-- User A uploads a document:
INSERT INTO documents (vault_id, name, uploaded_by, file_url)
VALUES ('vault_123', 'document.pdf', auth.uid(), 'file_path');

-- Supabase RLS checks:
1. Does the vault belong to this user?
   vault_123 IN (SELECT id FROM vaults WHERE user_id = auth.uid())? ✓

2. Is the uploader the current user?
   uploaded_by = auth.uid()? ✓

-- Result: Document created, RLS enforced
```

---

## User Authentication Flow

```
User visits app
        ↓
User clicks "Sign Up"
        ↓
User enters email & password
        ↓
Supabase Auth creates user account
        ↓
User receives verification email
        ↓
User verifies email
        ↓
User is authenticated (auth.uid() is now set)
        ↓
App creates user record in users table
        ↓
User can now create vaults and upload documents
        ↓
RLS policies automatically filter user's data
        ↓
User can only see their own information
```

---

## Complete Data Flow Example

### Scenario: Jane uploads a legal document

```
1. Jane logs in
   ├── Supabase Auth verifies credentials
   ├── Sets auth.uid() = 'jane_uuid'
   └── Jane is now authenticated

2. Jane navigates to vault: "Smith v. Jones Divorce"
   ├── App queries: SELECT * FROM vaults WHERE id = 'vault_123'
   ├── RLS policy checks: vault.user_id = auth.uid()?
   ├── 'jane_uuid' = 'jane_uuid'? ✓
   └── Vault loads successfully

3. Jane uploads "complaint.pdf"
   ├── App calls: INSERT INTO documents (vault_id, name, uploaded_by, ...)
   ├── RLS policy checks:
   │   ├── Vault exists for this user? ✓
   │   └── uploaded_by = auth.uid()? ✓
   ├── Document record created in database
   ├── File uploaded to: documents/jane_uuid/vault_123/complaint.pdf
   └── Document appears in Jane's vault

4. Jane logs out (auth.uid() is cleared)
   ├── Jane cannot access any protected routes
   ├── Any database queries return errors
   └── Jane must log in again to access data
```

---

## Security Model Summary

```
┌─────────────────────────────────────────────────────┐
│          SUPABASE SECURITY LAYERS                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Layer 1: Authentication (Supabase Auth)           │
│  ├─ Verifies user identity                         │
│  ├─ Manages login/logout                           │
│  └─ Sets auth.uid() for authenticated users        │
│                                                     │
│  Layer 2: RLS Policies (Database)                  │
│  ├─ Filters data based on auth.uid()               │
│  ├─ Enforced at database level                     │
│  └─ Works even if API is compromised               │
│                                                     │
│  Layer 3: API Keys (Access Control)                │
│  ├─ ANON key: Limited by RLS policies              │
│  ├─ SERVICE ROLE: Unrestricted (server only)       │
│  └─ URL: Public connection info                    │
│                                                     │
│  Layer 4: Storage Policies                         │
│  ├─ Users can only access their own files          │
│  ├─ Enforced by file path structure                │
│  └─ Combined with auth.uid() checks                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Performance Considerations

### Indexes for Fast Queries

```
Users table indexes:
  - email (for login lookups)

Vaults table indexes:
  - user_id (for "show my vaults")
  - created_at (for sorting)

Documents table indexes:
  - vault_id (for "show docs in vault")
  - uploaded_by (for "show my docs")
  - created_at (for sorting)

Why?
  Without indexes: Database scans entire table (SLOW)
  With indexes: Database uses index to jump to results (FAST)
```

### Query Performance Estimate

```
Lookup user's vaults:      ~5ms
  SELECT * FROM vaults WHERE user_id = auth.uid()

List documents in vault:   ~10ms
  SELECT * FROM documents WHERE vault_id = 'id'

Count user's vaults:       ~2ms
  SELECT COUNT(*) FROM vaults WHERE user_id = auth.uid()

Typical app load time:     50-200ms (dominated by front-end rendering)
Database is rarely the bottleneck for small/medium apps
```

---

## Scaling Considerations

### When should you scale?

```
Free tier suitable for:
  - Development and testing
  - < 1000 users
  - < 10,000 documents
  - < 1GB storage

Scale to Pro when:
  - User base grows to 5000+
  - Need more storage (>1GB)
  - Need dedicated support
  - Need automatic backups

Typical costs:
  - Free tier: $0/month
  - Pro tier: $25/month + overages
```

---

## Summary

**Architecture:** Three tables with foreign key relationships
- Users (accounts)
- Vaults (case folders)
- Documents (files)

**Security:** Multi-layer protection
- Authentication via Supabase Auth
- Row Level Security (RLS) policies
- API key separation
- Storage access control

**Scaling:** Starts free, scales to enterprise
- Free tier for MVP
- Pay-as-you-grow pricing
- Auto-scaling infrastructure

**Privacy:** Users can only access their own data
- RLS filters all queries
- Enforced at database level
- No trust in application code
