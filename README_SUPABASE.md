# Stand With Meg - Supabase Documentation Index

Complete documentation for setting up and using Supabase with the Stand With Meg pro se legal platform.

---

## Quick Start (5 minutes)

1. Read: **SUPABASE_SETUP_GUIDE.md** (Step 1-3)
2. Copy your API keys from Supabase
3. Add to `.env.local`
4. Restart your Next.js dev server

Done! You have basic setup.

---

## Complete Documentation

### 1. **SUPABASE_SETUP_GUIDE.md** - Complete Step-by-Step Setup
**Read this first!** Everything you need to get Supabase running.

What it covers:
- Create Supabase account and project
- Get API keys (3 keys needed)
- Configure environment variables
- Create database tables (users, vaults, documents)
- Set up Row Level Security (RLS) for privacy
- Set up file storage bucket
- Test the connection

**When to use:** First time setup, need detailed instructions

---

### 2. **SUPABASE_QUICK_REFERENCE.md** - Copy-Paste SQL Commands
Quick reference for all SQL commands you need.

What it covers:
- Setup checklist (printable)
- All SQL commands to create tables
- All SQL commands to enable RLS
- All SQL commands for storage policies
- Environment variables template
- Useful SQL queries
- Dashboard navigation map
- Troubleshooting matrix

**When to use:** Need SQL quickly, want a cheatsheet

---

### 3. **SUPABASE_ARCHITECTURE.md** - How It All Works
Visual guide to the database structure and security model.

What it covers:
- Database schema diagram
- Data relationships (users → vaults → documents)
- How Row Level Security works
- API keys and their permissions
- File storage organization
- Security layers explained
- Query examples with RLS filtering
- User authentication flow

**When to use:** Want to understand the design, explaining to others

---

### 4. **SUPABASE_NEXT_INTEGRATION.md** - Code Examples
Ready-to-use code for your Next.js app.

What it covers:
- Install `@supabase/supabase-js`
- Create Supabase client helper
- Authentication examples (sign up, login, get user)
- Database operation examples (create, read, update, delete)
- File upload/download examples
- React component examples
- API route examples
- Error handling
- Testing code

**When to use:** Ready to code, need examples to copy

---

### 5. **SUPABASE_TROUBLESHOOTING.md** - Common Issues & Fixes
When something goes wrong.

What it covers:
- Environment variable issues
- Database connection problems
- Authentication failures
- RLS permission errors
- File upload issues
- SQL & schema errors
- TypeScript type errors
- Performance issues
- Error message reference table
- Debugging tools

**When to use:** Something's broken, need help fixing it

---

## How to Use This Documentation

### Scenario 1: "I'm starting from scratch"
1. Start with **SUPABASE_SETUP_GUIDE.md** (Parts 1-9)
2. Follow each step in order
3. Keep **SUPABASE_QUICK_REFERENCE.md** handy for SQL
4. Once setup, read **SUPABASE_ARCHITECTURE.md** to understand it

**Time:** ~45 minutes total

### Scenario 2: "Setup is done, now I want to code"
1. Open **SUPABASE_NEXT_INTEGRATION.md**
2. Copy code examples into your app
3. Install required packages
4. Customize for your needs
5. Test with **SUPABASE_TROUBLESHOOTING.md** debugging tips

**Time:** ~2-3 hours depending on complexity

### Scenario 3: "Something is broken"
1. Go to **SUPABASE_TROUBLESHOOTING.md**
2. Find your problem in the table of contents
3. Follow the solution steps
4. If still stuck, check the error message reference table
5. Use debugging tools section

**Time:** 5-30 minutes (depends on issue)

### Scenario 4: "I need to explain this to someone"
1. Use **SUPABASE_ARCHITECTURE.md**
2. Show the diagrams and relationships
3. Explain the security layers
4. Share **SUPABASE_SETUP_GUIDE.md** for technical details

**Time:** ~30 minutes for presentation

---

## File Structure

```
standwithmeg/
├── .env.local                          # Your API keys (don't commit!)
├── SUPABASE_SETUP_GUIDE.md            # Step-by-step setup (START HERE)
├── SUPABASE_QUICK_REFERENCE.md        # SQL commands & cheatsheet
├── SUPABASE_ARCHITECTURE.md           # How it works, diagrams
├── SUPABASE_NEXT_INTEGRATION.md       # Code examples
├── SUPABASE_TROUBLESHOOTING.md        # Common issues & fixes
├── README_SUPABASE.md                 # This file
│
├── lib/
│   ├── supabaseClient.ts              # (You'll create this)
│   ├── vaultService.ts                # (Optional: database helpers)
│   └── storageService.ts              # (Optional: file helpers)
│
└── app/
    ├── signup/page.tsx                # (You'll create this)
    ├── login/page.tsx                 # (You'll create this)
    ├── dashboard/page.tsx             # (You'll create this)
    └── vaults/page.tsx                # (You'll create this)
```

---

## Key Concepts

### 1. API Keys (The Entry Points)
- **URL:** Connection address (public)
- **Anon Key:** For browser requests (public)
- **Service Role Key:** For server (SECRET!)

### 2. Tables (The Data Storage)
- **users:** User accounts and info
- **vaults:** Case folders per user
- **documents:** Files uploaded to vaults

### 3. Security (Row Level Security)
- Users can **only see their own data**
- Even if they hack the database
- RLS policies enforce this automatically

### 4. Storage (File Uploads)
- Separate from database
- Stores actual files (PDFs, docs, etc.)
- RLS also applies here

### 5. Authentication (Login)
- Supabase Auth handles sign up/login
- Sets auth.uid() when user logs in
- RLS uses auth.uid() to filter data

---

## Setup Checklist

Print this and check off as you go:

```
PREPARATION
□ Read SUPABASE_SETUP_GUIDE.md Part 1-2
□ Gather login credentials for Supabase

SUPABASE PROJECT
□ Create account at supabase.com
□ Create new project (name: stand-with-meg)
□ Wait for project to initialize (2-3 min)

API KEYS
□ Copy NEXT_PUBLIC_SUPABASE_URL
□ Copy NEXT_PUBLIC_SUPABASE_ANON_KEY
□ Copy SUPABASE_SERVICE_ROLE_KEY
□ Paste into .env.local
□ Save .env.local
□ Restart Next.js dev server

DATABASE TABLES
□ Open SQL Editor in Supabase
□ Create users table
□ Create vaults table
□ Create documents table
□ Verify all succeeded

ROW LEVEL SECURITY
□ Enable RLS on users table
□ Enable RLS on vaults table
□ Enable RLS on documents table
□ Create users table policies
□ Create vaults table policies
□ Create documents table policies

STORAGE
□ Create "documents" bucket in Storage
□ Enable RLS on storage bucket
□ Create storage policies

TESTING
□ Test database connection (app loads)
□ Test authentication (can sign up)
□ Test creating vault (appears in database)
□ Test uploading file (appears in storage)

READY FOR DEVELOPMENT
□ Read SUPABASE_NEXT_INTEGRATION.md
□ Start building features
```

---

## Common Questions

### Q: Do I need all three API keys?
**A:** Yes. Different parts of your app use different keys:
- Browser uses: URL + ANON key
- Server uses: URL + SERVICE ROLE key
- Never mix them up!

### Q: What if someone steals my ANON key?
**A:** It's okay! It's meant to be public. RLS policies protect your data even if the key is leaked.

### Q: What if someone steals my SERVICE ROLE key?
**A:** VERY BAD! They can access all data and bypass RLS. Never commit it to Git. Never expose it.

### Q: Why do I need RLS?
**A:** Even if someone gets your keys, they can't see other users' data. RLS enforces privacy at database level.

### Q: Can I use Supabase's built-in Auth?
**A:** Yes! Supabase Auth is recommended. It handles sign up, login, password reset, email verification, etc.

### Q: How much does Supabase cost?
**A:** Free tier is generous. You only pay when you exceed limits.

### Q: Can I export my data?
**A:** Yes! PostgreSQL is open source. You can export anytime.

### Q: What if Supabase goes down?
**A:** You'll have downtime. Choose another provider if reliability is critical. Or self-host PostgreSQL.

---

## Next Steps After Setup

1. **Build signup/login:**
   - Create user authentication pages
   - Save user profile to database
   - Set up password reset

2. **Build vault management:**
   - Create new vaults
   - List user's vaults
   - Edit/delete vaults

3. **Build document upload:**
   - Upload files to storage
   - Save metadata to database
   - List documents in vault

4. **Build document viewer:**
   - Display uploaded documents
   - Download files
   - Delete files

5. **Add features:**
   - Search documents
   - Share vaults (with permission)
   - Document versioning
   - Collaborative editing

---

## Support & Resources

**If you're stuck:**
1. Check **SUPABASE_TROUBLESHOOTING.md** first
2. Google the error message
3. Check Supabase docs: https://supabase.com/docs
4. Ask on Supabase Discord: https://discord.supabase.io
5. Check Stack Overflow with `[supabase]` tag

**Supabase Resources:**
- Official Docs: https://supabase.com/docs
- API Reference: https://supabase.com/docs/reference
- SQL Reference: https://www.postgresql.org/docs/current/
- Discord Community: https://discord.supabase.io
- GitHub Issues: https://github.com/supabase/supabase

**Next.js Resources:**
- Next.js Docs: https://nextjs.org/docs
- Next.js Discord: https://discord.gg/nextjs
- Next.js Examples: https://github.com/vercel/next.js/tree/canary/examples

---

## Document Update History

| Date | Changes |
|------|---------|
| 2026-03-26 | Initial documentation created |

---

## Quick Navigation

- **Need to set up?** → SUPABASE_SETUP_GUIDE.md
- **Need SQL?** → SUPABASE_QUICK_REFERENCE.md
- **Don't understand?** → SUPABASE_ARCHITECTURE.md
- **Need code?** → SUPABASE_NEXT_INTEGRATION.md
- **Something broken?** → SUPABASE_TROUBLESHOOTING.md

---

**You're all set! Start with SUPABASE_SETUP_GUIDE.md and follow along step-by-step.**

Good luck! 🚀
