# Stand With Meg - Supabase + Next.js Integration Guide

Code examples and patterns for integrating Supabase with your Next.js application.

---

## Prerequisites

- Supabase project set up (see SUPABASE_SETUP_GUIDE.md)
- Environment variables configured in `.env.local`
- All tables and RLS policies created

---

## Step 1: Install Supabase Client Library

```bash
npm install @supabase/supabase-js
```

---

## Step 2: Create Supabase Client Helper

Create a new file: `/lib/supabaseClient.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## Step 3: Authentication Examples

### Sign Up

```typescript
// app/signup/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Step 1: Create user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('User creation failed');

      // Step 2: Create user profile in database
      const { error: dbError } = await supabase.from('users').insert([
        {
          id: userId,
          email,
          first_name: firstName,
          last_name: lastName,
          state,
          plan: 'free',
        },
      ]);

      if (dbError) throw dbError;

      // Success
      alert('Account created! Check your email to verify.');
      // Redirect to login or dashboard
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignUp} className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Sign Up for Stand With Meg</h1>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">First Name</label>
        <input
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Last Name</label>
        <input
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">State</label>
        <input
          type="text"
          maxLength={2}
          value={state}
          onChange={(e) => setState(e.target.value.toUpperCase())}
          placeholder="CA"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Creating Account...' : 'Sign Up'}
      </button>
    </form>
  );
}
```

### Sign In

```typescript
// app/login/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Login</h1>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

### Get Current User

```typescript
// Hook to get current authenticated user
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        setUser(data.user);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    getUser();
  }, []);

  return { user, loading, error };
}
```

---

## Step 4: Database Operations

### Create a Vault

```typescript
// lib/vaultService.ts
import { supabase } from './supabaseClient';

export async function createVault(
  userId: string,
  name: string,
  type: string,
  caseNumber?: string,
  court?: string
) {
  const { data, error } = await supabase.from('vaults').insert([
    {
      user_id: userId,
      name,
      type,
      case_number: caseNumber,
      court,
    },
  ]);

  if (error) throw error;
  return data;
}
```

### Get User's Vaults

```typescript
export async function getUserVaults(userId: string) {
  const { data, error } = await supabase
    .from('vaults')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}
```

### Get Documents in a Vault

```typescript
export async function getVaultDocuments(vaultId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('vault_id', vaultId)
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return data;
}
```

### Update Vault

```typescript
export async function updateVault(
  vaultId: string,
  updates: {
    name?: string;
    type?: string;
    case_number?: string;
    court?: string;
  }
) {
  const { data, error } = await supabase
    .from('vaults')
    .update(updates)
    .eq('id', vaultId);

  if (error) throw error;
  return data;
}
```

### Delete Vault

```typescript
export async function deleteVault(vaultId: string) {
  const { error } = await supabase
    .from('vaults')
    .delete()
    .eq('id', vaultId);

  if (error) throw error;
}
```

---

## Step 5: File Upload to Storage

### Upload Document

```typescript
// lib/storageService.ts
import { supabase } from './supabaseClient';

export async function uploadDocument(
  userId: string,
  vaultId: string,
  file: File,
  fileName?: string
) {
  // Generate file path: documents/user_id/vault_id/filename
  const filePath = `${userId}/${vaultId}/${fileName || file.name}`;

  // Upload to storage
  const { data, error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // Get public URL (if bucket is public)
  // or use signed URL (recommended for private buckets)
  const { data: signedUrlData } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 60 * 60 * 24); // Valid for 24 hours

  const fileUrl = signedUrlData?.signedUrl || filePath;

  // Create document record in database
  const { data: docData, error: dbError } = await supabase
    .from('documents')
    .insert([
      {
        vault_id: vaultId,
        name: fileName || file.name,
        type: file.type,
        uploaded_by: userId,
        file_size: file.size,
        file_url: fileUrl,
      },
    ]);

  if (dbError) throw dbError;

  return docData;
}
```

### Download Document

```typescript
export async function downloadDocument(filePath: string) {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(filePath);

  if (error) throw error;

  // Create download link
  const url = window.URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filePath.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}
```

### Delete Document

```typescript
export async function deleteDocument(documentId: string, filePath: string) {
  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([filePath]);

  if (storageError) throw storageError;

  // Delete from database
  const { error: dbError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (dbError) throw dbError;
}
```

---

## Step 6: Component Examples

### Vault List Component

```typescript
// app/dashboard/VaultList.tsx
'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { getUserVaults } from '@/lib/vaultService';

interface Vault {
  id: string;
  name: string;
  type: string;
  case_number?: string;
  created_at: string;
}

export function VaultList() {
  const { user } = useCurrentUser();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    const loadVaults = async () => {
      try {
        const data = await getUserVaults(user.id);
        setVaults(data || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadVaults();
  }, [user]);

  if (loading) return <div>Loading vaults...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Your Vaults</h2>

      {vaults.length === 0 ? (
        <p className="text-gray-600">No vaults yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-4">
          {vaults.map((vault) => (
            <div key={vault.id} className="border rounded p-4 hover:shadow">
              <h3 className="font-semibold">{vault.name}</h3>
              <p className="text-sm text-gray-600">Type: {vault.type}</p>
              {vault.case_number && (
                <p className="text-sm text-gray-600">Case: {vault.case_number}</p>
              )}
              <button className="mt-2 text-blue-600 hover:underline">
                Open Vault
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### File Upload Component

```typescript
// app/vaults/FileUploadForm.tsx
'use client';

import { useState, useRef } from 'react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { uploadDocument } from '@/lib/storageService';

interface FileUploadFormProps {
  vaultId: string;
  onUploadComplete?: () => void;
}

export function FileUploadForm({ vaultId, onUploadComplete }: FileUploadFormProps) {
  const { user } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setError('');
    setProgress(0);

    try {
      // Simulate progress (optional)
      setProgress(50);

      await uploadDocument(user.id, vaultId, file);

      setProgress(100);
      alert('Document uploaded successfully!');

      // Reset form
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      onUploadComplete?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border rounded">
      <h3 className="font-semibold mb-4">Upload Document</h3>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        disabled={uploading}
        className="mb-4"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.png"
      />

      {uploading && (
        <div className="w-full bg-gray-200 rounded h-2">
          <div
            className="bg-blue-600 h-2 rounded transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

---

## Step 7: API Route for Server-Side Operations

### Server-side file upload (more secure)

```typescript
// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client with service role (server-side)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const vaultId = formData.get('vaultId') as string;
    const userId = formData.get('userId') as string;

    if (!file || !vaultId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Upload file
    const filePath = `${userId}/${vaultId}/${file.name}`;
    const buffer = await file.arrayBuffer();

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    return NextResponse.json({ success: true, filePath: data.path });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
```

---

## Step 8: Error Handling

### Custom Error Hook

```typescript
// lib/useSupabaseError.ts
export function useSupabaseError(error: any): string {
  if (!error) return '';

  // Supabase specific errors
  if (error.message === 'Invalid login credentials') {
    return 'Email or password is incorrect.';
  }

  if (error.message === 'Email not confirmed') {
    return 'Please verify your email before logging in.';
  }

  if (error.message.includes('duplicate key value')) {
    return 'This email is already registered.';
  }

  // Generic errors
  return error.message || 'An unexpected error occurred.';
}
```

---

## Step 9: Debugging

### Enable Supabase Logging

```typescript
// In development, add this to your client initialization
if (process.env.NODE_ENV === 'development') {
  const { createClient } = await import('@supabase/supabase-js');

  const debugClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    }
  );

  // Log all auth state changes
  debugClient.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event, 'Session:', session);
  });
}
```

---

## Step 10: Testing the Integration

### Manual Test Checklist

- [ ] Sign up a new user → Check users table has record
- [ ] Log in with user → Auth.uid() is set
- [ ] Create a vault → Check vaults table has record
- [ ] Upload a document → Check storage bucket and documents table
- [ ] View vault documents → RLS filters correctly
- [ ] Try to access another user's vault → Should get error
- [ ] Log out → Session cleared

### Sample Test Code

```typescript
// tests/integration.test.ts
import { supabase } from '@/lib/supabaseClient';

async function testIntegration() {
  console.log('Starting integration tests...');

  // Test 1: Can we connect?
  try {
    const { data } = await supabase.from('users').select('count()', { count: 'exact' });
    console.log('✓ Database connection works');
  } catch (err) {
    console.log('✗ Database connection failed:', err);
  }

  // Test 2: Can we get current user?
  try {
    const { data } = await supabase.auth.getUser();
    console.log('✓ Auth works. Current user:', data.user?.email);
  } catch (err) {
    console.log('✗ Auth failed:', err);
  }
}

testIntegration();
```

---

## Summary

You now have:
- ✓ Supabase client set up
- ✓ Authentication functions
- ✓ Database service functions
- ✓ File upload/download functions
- ✓ Example components
- ✓ Error handling patterns

Next steps:
1. Copy these components into your app
2. Customize styling to match your design
3. Add additional features (search, filtering, sharing)
4. Deploy to production

---

## Useful Resources

- **Supabase JavaScript Reference:** https://supabase.com/docs/reference/javascript/introduction
- **Supabase Auth Guide:** https://supabase.com/docs/guides/auth
- **Supabase Storage Guide:** https://supabase.com/docs/guides/storage
- **Next.js Documentation:** https://nextjs.org/docs
