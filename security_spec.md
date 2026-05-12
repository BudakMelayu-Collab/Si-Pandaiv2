# Security Specification for Si-PANDAI

## Data Invariants
1. A recipient must have a name, NIK (16 chars), and status.
2. Only verified users can read/write data.
3. Monthly payments must belong to a valid sector.
4. Companion reports must have an uploaderId that matches the authenticated user.
5. PII (NIK, Address, etc.) is sensitive and access should be restricted (though in this management app, verified staff might need all data).

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempting to create a recipient with a different `uploaderId` (if it was implemented) or modifying someone else's metadata.
2. **Invalid NIK**: Creating a recipient with a NIK that is not 16 characters.
3. **Ghost Fields**: Adding `isVerified: true` to a recipient document.
4. **ID Poisoning**: Using a 1MB string as a recipient ID.
5. **PII Leak**: A non-verified user attempting to list recipients.
6. **State Shortcutting**: Skipping "Proses Berkas" status directly to "Selesai" without proper transitions (if enforced).
7. **Bypassing Server Timestamps**: Providing a client-side `createdAt` timestamp.
8. **Unauthorized Settings Update**: A non-admin user modifying global app settings.
9. **Companion Report Hijacking**: Trying to delete a companion report uploaded by someone else.
10. **Resource Exhaustion**: Sending a recipient name with 1MB of text.
11. **Orphaned Templates**: Creating a template for a non-existent recipient ID.
12. **Malicious Path Injection**: Attempting to access collections outside the defined scope.

## Test Runner (Simplified)
The `firestore.rules.test.ts` would verify these scenarios. In this environment, we rely on the `firestore.rules` structure to prevent these.
