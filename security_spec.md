# Security Specification & Threat Model (sweety Companion)

This document outlines the data invariants, malicious payloads ("Dirty Dozen"), and security tests for our Firestore Security Architecture.

## 1. Data Invariants

- **User Profiles (`/users/{userId}`)**:
  - Only the authenticated user whose `request.auth.uid == userId` can read or write their profile.
  - The email field must match the authenticated user's email (`request.auth.token.email`).
  - The user's email must be verified (`request.auth.token.email_verified == true`).
  - Fields such as `uid`, `displayName`, and `email` must be immutable once created.
  - Optional or state fields like `theme` must be restricted to a strict enum list: `['purple', 'pink', 'emerald', 'blue']`.
  - Global game stats like `ludoPlayed` and `ludoWon` must be integers and cannot be negative.
  - All keys in the request payload must strictly match the permitted set (no ghost fields).

- **Ludo Match Records (`/users/{userId}/matches/{matchId}`)**:
  - Only the parent user (`userId == request.auth.uid`) can write to their match records.
  - Users can read only their own matches. General blanket list/reads of all matches are denied.
  - Completed matches are immutable. No updates or deletes are permitted once created.
  - Positions (`playerPos` and `mahiPos`) must be integers between `0` and `15` (board size limit).
  - The `winner` field must be either `'player'` or `'mahi'`.
  - The `createdAt` field must be a server-generated timestamp (`request.time`).

- **Conversation Message Logs (`/users/{userId}/messages/{messageId}`)**:
  - Only the parent user can write message logs.
  - Message logs are immutable. Once written, they cannot be updated or deleted.
  - The `createdAt` field must match the server timestamp (`request.time`).
  - Payload keys must strictly match the scheme.

---

## 2. The "Dirty Dozen" Payloads (Attacks)

Below are twelve malicious payloads/scenarios designed to break system rules. Our Security Rules must guarantee that all of these return `PERMISSION_DENIED`.

### Attack 1: Spoofed Identity Profile Creation
*   **Target**: `/users/krish_user_123`
*   **Payload**: `{"uid": "someone_else_123", "displayName": "Attacker", "email": "attacker@spam.com"}`
*   **Vector**: Attempting to create a profile under user `krish_user_123` but binding the inner fields to another user ID.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 2: Profile Privilege Escalation (Ghost Field Injection)
*   **Target**: `/users/krish_user_123`
*   **Payload**: `{"uid": "krish_user_123", "displayName": "Krish", "email": "krish@verified.com", "isAdmin": true, "vipStatus": "premium"}`
*   **Vector**: Injecting undocumented privilege fields like `isAdmin` or `vipStatus` during profile creation/update.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 3: Profile Schema/Enum Violation
*   **Target**: `/users/krish_user_123`
*   **Payload**: `{"uid": "krish_user_123", "displayName": "Krish", "email": "krish@verified.com", "theme": "yellow"}`
*   **Vector**: Providing a theme value (`yellow`) that is not supported by the system's strict configuration.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 4: Unauthenticated Profile Creation
*   **Target**: `/users/krish_user_123`
*   **Payload**: `{"uid": "krish_user_123", "displayName": "Krish", "email": "krish@verified.com"}`
*   **User State**: Unauthenticated / Guest
*   **Vector**: Directly calling write methods without signing in.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 5: Unverified Email Profile Write
*   **Target**: `/users/krish_user_123`
*   **Payload**: `{"uid": "krish_user_123", "displayName": "Krish", "email": "krish@unverified.com"}`
*   **User State**: Authenticated, but `email_verified == false`.
*   **Vector**: Attempting to register/update settings before verifying the email.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 6: Cross-User Profile Read (PII Exposure)
*   **Target**: `/users/victim_user_456`
*   **User State**: Authenticated as `krish_user_123`.
*   **Vector**: Querying or directly reading another user's personal details and settings.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 7: Board Limit Poisoning (Out-of-Bound Position)
*   **Target**: `/users/krish_user_123/matches/match_999`
*   **Payload**: `{"userId": "krish_user_123", "playerPos": 100, "mahiPos": -5, "winner": "player", "createdAt": "request.time"}`
*   **Vector**: Creating a match with an impossible player position (100) or negative position (-5) to poison statistics.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 8: Denial of Wallet Space Attack (ID/Value Poisoning)
*   **Target**: `/users/krish_user_123/matches/SUPER_LONG_INVALID_ID_THAT_HAS_OVER_1000_CHARACTERS_AND_SPECIAL_SYMBOLS_$$$`
*   **Payload**: `{"userId": "krish_user_123", "playerPos": 15, "mahiPos": 12, "winner": "player", "createdAt": "request.time"}`
*   **Vector**: Injecting giant, malformed document IDs and large properties to exhaust Firestore memory/indices.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 9: Retroactive Game Result Modification (History Tampering)
*   **Target**: `/users/krish_user_123/matches/match_123`
*   **Payload**: `{"userId": "krish_user_123", "playerPos": 15, "mahiPos": 2, "winner": "player", "createdAt": "request.time"}`
*   **Action**: Updating a match that was already completed and saved in the database.
*   **Vector**: Trying to change the final score/winner of a previous match.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 10: Cross-User Game Log Injection
*   **Target**: `/users/victim_user_456/matches/match_abc`
*   **Payload**: `{"userId": "victim_user_456", "playerPos": 15, "mahiPos": 0, "winner": "player", "createdAt": "request.time"}`
*   **User State**: Authenticated as `krish_user_123`.
*   **Vector**: Writing game match logs under another user's profile subcollection.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 11: Malformed Chat Log Injection (Missing Fields)
*   **Target**: `/users/krish_user_123/messages/msg_001`
*   **Payload**: `{"userId": "krish_user_123", "userText": "Hello", "createdAt": "request.time"}`
*   **Vector**: Missing required fields like `mahiText` in the message structure.
*   **Expected Result**: `PERMISSION_DENIED`

### Attack 12: Retroactive Chat Log Modification
*   **Target**: `/users/krish_user_123/messages/msg_001`
*   **Payload**: `{"userId": "krish_user_123", "userText": "Altered message", "mahiText": "Mahi's altered answer", "createdAt": "request.time"}`
*   **Action**: Updating or deleting an existing chat log.
*   **Vector**: Attempting to rewrite conversation history.
*   **Expected Result**: `PERMISSION_DENIED`

---

## 3. Test Assertions

| Target Collection | Action | Allowed condition | Blocked condition |
|---|---|---|---|
| `/users/{userId}` | Create | Auth matches `userId` + email matches auth token + verified email + valid schema keys/types | Unauth, mismatched auth ID, unverified email, extra parameters (ghost fields), wrong theme |
| `/users/{userId}` | Update | Auth matches `userId` + verified email + immutable profile fields remain identical + allowed fields | Unauth, changing `uid` or `email`, invalid theme value |
| `/users/{userId}` | Delete | False (Always Blocked) | All attempts |
| `/users/{userId}/matches/{matchId}` | Create | Auth matches parent `userId` + position limits 0..15 + server timestamp + correct schema | Unauth, mismatched user ID, out of range positions, non-server timestamp, ghost fields |
| `/users/{userId}/matches/{matchId}` | Read/List | Auth matches `userId` | Unauth, cross-user read attempts |
| `/users/{userId}/matches/{matchId}` | Update/Delete | False (Immutable Match History) | All attempts |
| `/users/{userId}/messages/{messageId}` | Create | Auth matches parent `userId` + server timestamp + valid message schema | Unauth, mismatched user ID, non-server timestamp |
| `/users/{userId}/messages/{messageId}` | Read/List | Auth matches `userId` | Unauth, cross-user read |
| `/users/{userId}/messages/{messageId}` | Update/Delete | False (Immutable Chat History) | All attempts |
