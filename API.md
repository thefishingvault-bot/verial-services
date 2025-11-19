# Verial Services API Documentation

This document describes the API endpoints available in the Verial Services application, with a focus on user data management.

## Table of Contents

- [Authentication](#authentication)
- [User Profile Endpoints](#user-profile-endpoints)
  - [GET /api/profile/get](#get-apiprofileget)
  - [PATCH /api/profile/update](#patch-apiprofileupdate)
  - [DELETE /api/profile/delete](#delete-apiprofiledelete)

## Authentication

All endpoints require authentication via Clerk. The authenticated user's ID is obtained from the session and used to authorize requests.

## User Profile Endpoints

### GET /api/profile/get

**Purpose**: Retrieves the authenticated user's profile data, including provider information if applicable.

**What does this endpoint do?**

1. **Authenticates the user** - Verifies the request comes from an authenticated Clerk session
2. **Fetches user data** - Queries the local database for the user profile
3. **Auto-creates missing profiles** - If the user exists in Clerk but not in the local database, it automatically syncs them
4. **Includes provider data** - If the user is also a provider, returns provider-specific fields (bio, businessName, handle)

**Request**

```http
GET /api/profile/get
Authorization: Required (Clerk session)
```

**Response Success (200)**

```json
{
  "id": "user_2abc123...",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "avatarUrl": "https://...",
  "role": "user",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "providerId": "prov_xyz789...",
  "provider": {
    "bio": "Professional service provider",
    "businessName": "John's Services",
    "handle": "johns-services"
  }
}
```

**Response Errors**

- `401 Unauthorized` - User is not authenticated
- `400 Bad Request` - User email not found in Clerk
- `500 Internal Server Error` - Failed to create or find user profile

**Data Structure**

The endpoint returns a `User` object with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Clerk User ID (primary key) |
| `email` | string | User's email address |
| `firstName` | string | User's first name |
| `lastName` | string | User's last name |
| `avatarUrl` | string | URL to user's avatar image |
| `role` | enum | User role: "user", "provider", or "admin" |
| `createdAt` | timestamp | When the user was created |
| `updatedAt` | timestamp | When the user was last updated |
| `providerId` | string | Reference to provider profile (if applicable) |
| `provider` | object | Provider data (if user is a provider) |

**Provider Data** (when included):

| Field | Type | Description |
|-------|------|-------------|
| `bio` | string | Provider biography/description |
| `businessName` | string | Provider's business name |
| `handle` | string | Provider's unique handle (e.g., @username) |

---

### PATCH /api/profile/update

**Purpose**: Updates the authenticated user's profile information, syncing changes to both Clerk and the local database.

**What does this endpoint do?**

1. **Authenticates the user** - Verifies the request comes from an authenticated session
2. **Updates Clerk** - Syncs firstName, lastName, and avatarUrl to Clerk (the source of truth for identity)
3. **Updates local database** - Updates the user record in the local database
4. **Handles provider fields** - If the user is a provider, updates provider-specific fields (bio, businessName, handle)
5. **Validates permissions** - Ensures only providers can update provider-specific fields

**Request**

```http
PATCH /api/profile/update
Authorization: Required (Clerk session)
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "avatarUrl": "https://...",
  "bio": "Updated bio",
  "businessName": "New Business Name",
  "handle": "new-handle"
}
```

**Request Body** (all fields optional):

| Field | Type | Description |
|-------|------|-------------|
| `firstName` | string | User's first name |
| `lastName` | string | User's last name |
| `avatarUrl` | string | URL to user's avatar image |
| `bio` | string | Provider biography (provider only) |
| `businessName` | string | Provider's business name (provider only) |
| `handle` | string | Provider's unique handle (provider only) |

**Response Success (200)**

```json
{
  "success": true
}
```

**Response Errors**

- `401 Unauthorized` - User is not authenticated
- `403 Forbidden` - User is not a provider but tried to update provider-specific fields
- `500 Internal Server Error` - Failed to update profile

**Behavior Notes**

- Only fields included in the request body are updated
- Updates are synchronized to Clerk for identity fields (firstName, lastName, avatarUrl)
- Provider fields (bio, businessName, handle) are only updated if the user has a provider profile
- The `updatedAt` timestamp is automatically set to the current time

---

### DELETE /api/profile/delete

**Purpose**: Permanently deletes the authenticated user's account from both the local database and Clerk.

**What does this endpoint do?**

1. **Authenticates the user** - Verifies the request comes from an authenticated session
2. **Deletes from local database** - Removes the user record from the local database
3. **Cascades deletions** - Automatically deletes related data:
   - Provider profile (if applicable) via `onDelete: cascade`
   - Bookings are updated to reference a null user via `onDelete: set null`
4. **Deletes from Clerk** - Removes the user from Clerk (the source of truth)

**Request**

```http
DELETE /api/profile/delete
Authorization: Required (Clerk session)
```

**Response Success (200)**

```json
{
  "success": true
}
```

**Response Errors**

- `401 Unauthorized` - User is not authenticated
- `500 Internal Server Error` - Failed to delete user account

**Behavior Notes**

- This is a **permanent** action and cannot be undone
- The database schema handles cascading deletions:
  - Provider profiles are deleted automatically
  - Bookings are updated to reference null instead of being deleted
  - Reviews and notifications are also handled by cascade rules
- Clerk is considered the source of truth, so deletion from Clerk is the final step

---

## Data Flow

```
GET /api/profile/get
┌─────────────────────────────────────────────────────────────┐
│ 1. Authenticate user via Clerk session                      │
│ 2. Query local database for user profile                    │
│ 3. If not found:                                             │
│    a. Fetch user data from Clerk                             │
│    b. Create user in local database                          │
│    c. Query again to get profile with relations              │
│ 4. Return user profile (with provider data if applicable)   │
└─────────────────────────────────────────────────────────────┘

PATCH /api/profile/update
┌─────────────────────────────────────────────────────────────┐
│ 1. Authenticate user via Clerk session                      │
│ 2. Update Clerk (firstName, lastName, avatarUrl)            │
│ 3. Update local users table                                 │
│ 4. If provider fields present:                              │
│    a. Verify user has provider profile                      │
│    b. Update provider table                                 │
│ 5. Return success response                                  │
└─────────────────────────────────────────────────────────────┘

DELETE /api/profile/delete
┌─────────────────────────────────────────────────────────────┐
│ 1. Authenticate user via Clerk session                      │
│ 2. Delete from local database (cascades to provider)        │
│ 3. Delete from Clerk (source of truth)                      │
│ 4. Return success response                                  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Users Table

The `users` table mirrors Clerk users and stores application-specific data:

```typescript
{
  id: string;              // Clerk User ID (primary key)
  email: string;           // Unique email address
  firstName?: string;      // User's first name
  lastName?: string;       // User's last name
  avatarUrl?: string;      // Avatar image URL
  role: 'user' | 'provider' | 'admin';  // User role
  createdAt: Date;         // Creation timestamp
  updatedAt: Date;         // Last update timestamp
  providerId?: string;     // Reference to provider profile
}
```

### Providers Table

The `providers` table stores provider-specific data:

```typescript
{
  id: string;              // Provider ID (primary key)
  userId: string;          // Reference to user (unique, cascades on delete)
  handle: string;          // Unique handle (e.g., @username)
  businessName: string;    // Business name
  bio?: string;            // Provider biography
  status: 'pending' | 'approved' | 'rejected';
  isVerified: boolean;     // Verification status
  trustLevel: 'bronze' | 'silver' | 'gold' | 'platinum';
  trustScore: number;      // Trust score (default: 0)
  stripeConnectId?: string; // Stripe Connect account ID
  chargesEnabled: boolean; // Can accept charges
  payoutsEnabled: boolean; // Can receive payouts
  chargesGst: boolean;     // Charges include GST
  createdAt: Date;         // Creation timestamp
  updatedAt: Date;         // Last update timestamp
}
```

## Integration with Clerk

Verial Services uses [Clerk](https://clerk.com) for authentication. Key integration points:

- **Authentication**: All API endpoints use `auth()` from `@clerk/nextjs/server` to verify user sessions
- **User Sync**: The `/api/profile/get` endpoint auto-creates local user records from Clerk data
- **Data Consistency**: Updates to user identity fields (name, avatar) are synced to Clerk
- **Deletion**: User deletion removes records from both the local database and Clerk

## Security Considerations

1. **Authentication Required**: All endpoints require a valid Clerk session
2. **User Isolation**: Users can only access and modify their own data
3. **Provider Verification**: Provider-specific fields can only be updated by users with provider profiles
4. **Cascade Protection**: Database relationships use appropriate cascade rules to maintain data integrity
5. **Error Handling**: Sensitive error details are logged server-side but not exposed to clients

## Example Use Cases

### New User Login Flow

1. User signs in via Clerk
2. Frontend calls `GET /api/profile/get`
3. If user doesn't exist locally, endpoint auto-creates profile from Clerk data
4. User profile is returned and can be used throughout the app

### Updating Profile Information

1. User updates their profile in the UI
2. Frontend calls `PATCH /api/profile/update` with changed fields
3. Changes are synced to both Clerk and local database
4. UI reflects updated information

### Account Deletion

1. User requests account deletion
2. Frontend calls `DELETE /api/profile/delete`
3. All user data is removed from local database
4. User is deleted from Clerk
5. User is logged out

## Summary

The user data endpoints in Verial Services provide a complete profile management system that:

- ✅ **Syncs with Clerk** for authentication and identity management
- ✅ **Auto-creates profiles** when users first authenticate
- ✅ **Supports both users and providers** with role-specific data
- ✅ **Maintains data consistency** across multiple systems
- ✅ **Handles deletions safely** with appropriate cascade rules
- ✅ **Provides comprehensive error handling** for edge cases
