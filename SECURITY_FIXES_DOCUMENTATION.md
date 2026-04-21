# Security Fixes Documentation

This document details all changes made to fix critical and high severity vulnerabilities in the Adapt Authoring Tool project.

## Summary

Fixed multiple critical/high vulnerabilities and remaining moderate issues by:
1. Adding npm `overrides` to force safe versions of vulnerable transitive dependencies
2. Updating Mongoose from v5 to v6 with compatibility fixes
3. Removing deprecated Mongoose connection options
4. Fixing session store configuration for MongoDB driver compatibility
5. Replacing deprecated `request` usage with native HTTP(S) requests in install helpers

Current status after `npm install` + `npm audit`: **0 vulnerabilities**.

## Files Changed

### 1. `package.json`

#### Dependency Updates
- **mongoose**: `^5.8.13` → `^6.13.0` (Mongoose 6 compatibility)
- **email-templates**: `^8.1.0` → `^13.0.1`
- **connect-mongodb-session**: `^2.4.1` (kept at 2.x for BSON compatibility with Mongoose 6)
- **matchdep**: `^1.0.0` → `^2.0.0` (fixes `micromatch` ReDoS advisory)
- **nodemailer**: `^7.0.11` → `^8.0.5`
- **mocha**: `^6.2.3` → `^11.7.5` (dev dependency update)
- **request**: removed (deprecated and vulnerable)

#### Added `overrides` Section
Added npm `overrides` to force safe versions of vulnerable transitive dependencies:

```json
"overrides": {
  "braces": "^3.0.3",
  "json-schema-mapper": {
    "underscore": "^1.13.6"
  },
  "email-templates": {
    "nodemailer": "^8.0.5"
  },
  "archetype": {
    "mpath": "^0.9.0"
  },
  "serialize-javascript": "^7.0.5",
  "diff": "^8.0.3",
  "micromatch": "^4.0.8"
}
```

**Vulnerabilities Addressed:**
- `underscore` 1.3.2-1.12.0 (Arbitrary Code Execution) - fixed via override for json-schema-mapper
- `braces <=3.0.2` (ReDoS) - fixed via global override
- `mpath` (via archetype) - updated to safe version
- `serialize-javascript <=7.0.4` (via mocha) - fixed via override
- `diff <8.0.3` (via mocha) - fixed via override
- `micromatch <4.0.8` (via matchdep) - fixed via override/update
- `request`/`qs` vulnerabilities - fixed by removing `request` dependency

### 2. `lib/dml/mongoose/index.js`

#### Changes Made:

**Line 14: Removed deprecated `useCreateIndex` option**
- **Before:** `mongoose.set('useCreateIndex', true);`
- **After:** Removed (not valid in Mongoose 6)

**Lines 14-18: Added `strictPopulate` configuration**
- **Added:**
```javascript
// Restore pre-Mongoose 7 behaviour: ignore populates on paths not in the schema
// to avoid breaking existing schemas that refer to virtual/tag relationships.
if (typeof mongoose.set === 'function') {
  mongoose.set('strictPopulate', false);
}
```
- **Reason:** Mongoose 6+ throws errors when populating paths not in schema. This restores the old behavior to prevent breaking existing code that populates virtual relationships like `tags`.

**Lines 73-77: Removed `domainsEnabled` option**
- **Before:**
```javascript
options = { ...configuration.getConfig('dbOptions'), ...{
  domainsEnabled: true,
  useNewUrlParser: true,
  useUnifiedTopology: true
}};
```
- **After:**
```javascript
options = {
  ...configuration.getConfig('dbOptions'),
  useNewUrlParser: true,
  useUnifiedTopology: true
};
```
- **Reason:** `domainsEnabled` is not supported in Mongoose 6

**Lines 108-122: Fixed connection promise handling**
- **Before:**
```javascript
return mongoose.createConnection(connectionString, options).then(function(conn) {
  this.conn = conn;
  // ... rest of code
}.bind(this));
```
- **After:**
```javascript
// Mongoose 6: createConnection returns a Connection, use asPromise() for async flow
const conn = mongoose.createConnection(connectionString, options);
return conn.asPromise().then(function() {
  this.conn = conn;
  // ... rest of code
}.bind(this));
```
- **Reason:** In Mongoose 6, `createConnection()` returns a `Connection` object, not a promise. Use `asPromise()` to get a promise for async handling.

### 3. `lib/application.js`

#### Changes Made:

**Lines 275-278: Removed `domainsEnabled` from MongoStore connection options**
- **Before:**
```javascript
store: new MongoStore({ 
  uri: db.conn.connectionUri,
  connectionOptions: {
    domainsEnabled: true,
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
}),
```
- **After:**
```javascript
store: new MongoStore({ 
  uri: db.conn.connectionUri,
  connectionOptions: {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
}),
```
- **Reason:** `domainsEnabled` is not supported by the MongoDB driver used by `connect-mongodb-session`

### 4. `lib/installHelpers.js`

#### Changes Made:

- Removed dependency on `request`
- Added internal `requestUrl()` helper using Node's built-in `http`/`https` modules
- Updated GitHub connectivity/version-check code paths to use `requestUrl()`

## Installation Instructions

After applying these changes:

1. **Delete `node_modules` and `package-lock.json`:**
   ```bash
   rm -rf node_modules package-lock.json
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Restart the server:**
   ```bash
   node server.js
   ```

## Testing Checklist

After applying the patch, verify:

- [ ] Server starts without errors
- [ ] Database connection is established successfully
- [ ] User login works correctly
- [ ] Content objects can be loaded (e.g., `/api/content/config/{id}`)
- [ ] Session persistence works (login persists across requests)
- [ ] No BSON version errors in logs
- [ ] No "useCreateIndex" or "domainsEnabled" errors in logs
- [ ] No "strictPopulate" errors when loading content objects

## Rollback Instructions

If issues occur, to rollback:

1. Restore original `package.json` (remove `overrides` section, revert dependency versions)
2. Restore original `lib/dml/mongoose/index.js` (re-add `useCreateIndex`, remove `strictPopulate`, revert connection code)
3. Restore original `lib/application.js` (re-add `domainsEnabled` to MongoStore)
4. Run `npm install` to restore original dependencies

## Notes

- These changes maintain backward compatibility with existing data and schemas
- The `strictPopulate: false` setting allows existing code that populates virtual relationships to continue working
- All currently reported npm vulnerabilities are resolved in this workspace (`npm audit` reports 0)

## References

- Mongoose 6 Migration Guide: https://mongoosejs.com/docs/migrating_to_6.html
- npm overrides documentation: https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides
- Security advisories addressed:
  - GHSA-cf4h-3jhx-xvhq (underscore)
  - GHSA-fjxv-7rqg-78g4 (form-data)
  - GHSA-g95f-p29q-9xw4, GHSA-grv7-fg5c-xmjg (braces)

