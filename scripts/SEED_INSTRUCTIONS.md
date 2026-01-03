# Seeding Historical Test Data

## Quick Start

### 1. Get Your User ID

**Option A: From Browser Console**
1. Sign in to the app at `http://localhost:5173`
2. Open browser DevTools (F12 or Cmd+Option+I)
3. Go to Console tab
4. Run this command:
```javascript
firebase.auth().currentUser.uid
```
5. Copy the UID that appears

**Option B: From Firebase Console**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to Authentication → Users
4. Find your account and copy the User UID

### 2. Run the Seed Script

Once you have your User ID, run:

```bash
npm run seed:logs -- YOUR_USER_ID_HERE
```

**Example:**
```bash
npm run seed:logs -- abc123def456ghi789
```

## What Gets Created

The script generates **54 historical training sessions** spanning approximately 3-6 months:

### Max Attempts (27 sessions)
- **8 DYN sessions** - Progressive improvement from ~75m to ~95m
- **6 DNF sessions** - Progressive improvement from ~50m to ~60m
- **5 DYNB sessions** - Progressive improvement from ~65m to ~80m
- **8 STA sessions** - Progressive improvement from 2:30 to 3:30+

### Interval Training (27 sessions)
- **12 Sweet 16 sessions** - 16×50m intervals across DYN/DNF/DYNB
- **15 Gentle 2-Breath sessions** - 10×1:30 static holds

### Realistic Variations
All generated data includes:
- ✅ Varied times of day (morning/afternoon/evening)
- ✅ Different breathing techniques (tidal/hyperventilation/hypoventilation)
- ✅ Realistic RPE scores (4-10)
- ✅ Joy scale ratings (5-10)
- ✅ Hours since last meal (2-6)
- ✅ Progressive improvement over time with natural variance
- ✅ Occasional notes on good sessions

## After Seeding

1. Refresh your analytics page
2. You should see:
   - Training volume charts with historical data
   - Time of day analysis with multiple sessions
   - PB proximity tracking showing improvement
   - Progress over time across all timeframes (1 month, 6 months, 1 year)

## Troubleshooting

**Error: "User ID required"**
- Make sure to include `--` before your user ID in the command

**Error: Firebase permission denied**
- Check that you're using the correct user ID
- Verify your Firebase security rules allow writes to `routineLogs` collection

**Want to reset?**
- Go to Firebase Console → Firestore Database
- Delete the `routineLogs` collection
- Re-run the seed script

## Customizing the Data

Want to modify what gets generated? Edit `scripts/seed-historical-logs.ts`:

- **Change date range:** Adjust the `daysOffset` calculations in each generator function
- **More/fewer sessions:** Change the session count parameters in `seedHistoricalLogs()`
- **Different starting PBs:** Modify the `baseDistance` and `baseTime` values
- **Improvement rates:** Adjust the `improvementRate` constants

Example:
```typescript
// Make DYN progression faster
const improvementRate = 0.03; // Changed from 0.02 (3% vs 2%)

// Generate more Sweet 16 sessions
allSessions.push(...generateSweet16Sessions(now, 20, userId)); // Changed from 12
```
