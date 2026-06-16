# Security Specification - FitClub

## Data Invariants
1. A User document must have a unique ID matching their Firebase Auth UID.
2. Users can only modify their own profile and history (except for admin status which only Admins can toggle).
3. The competition settings can only be modified by Admins.
4. Points and weight loss must be numeric and non-negative (points).
5. History entries must occur on a valid date.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to create a user document with a different UID than `request.auth.uid`.
2. **Privilege Escalation**: Non-admin user attempts to setting `isAdmin: true` on their own profile.
3. **Settings Tampering**: Non-admin user attempts to update `/settings/competition`.
4. **History Injection**: User attempts to push a `WeighIn` entry into another user's history array.
5. **Points Manipulation**: User attempts to directly set `totalPoints` to a very high value without a valid weigh-in.
6. **Shadow Field**: Adding a field like `isVerified: true` to a user document.
7. **Negative Weight**: Attempting to set `initialWeight` to -50.
8. **String Bomb**: Sending a 1MB string for `pseudonym`.
9. **Invalid ID**: Using a document ID with special characters that should be rejected by `isValidId`.
10. **Admin Lockdown**: Admin trying to remove their own admin status (self-lockout) - *well, maybe allowed, but we should check*.
11. **PII Leak**: Non-admin user trying to read all `realName` fields of other users.
12. **Future Date**: Registering a weigh-in with a date in the distant future.

## Test Runner (Draft)
I will implement a robust `firestore.rules` that handles these cases.
