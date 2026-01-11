# How Overdive Dreaming Works

A simple explanation of how the app stores and manages your freediving training data.

## Overview

Think of the app as a digital training logbook that lives in the cloud. When you log a dive or create a routine, that information is saved to Google's Firebase service, which means:

- ✅ Your data is automatically backed up
- ✅ You can access it from any device
- ✅ It syncs in real-time across devices
- ✅ Your data is secure and private

---

## The Three Services We Use

### 1. Authentication (Who You Are)
When you sign in with Google, Firebase confirms your identity. This ensures:
- Only you can see your training data
- Your routines stay private unless you share them
- You stay logged in across sessions

### 2. Firestore Database (Your Training Data)
This is where all your training information is stored:

| What's Stored | Examples |
|---------------|----------|
| **Your Profile** | Display name, photo, email |
| **Training Routines** | CO₂ tables, interval protocols, custom workouts |
| **Session Logs** | Every dive you've logged with all the details |
| **Personal Bests** | Your best performances per discipline |
| **Seasons** | Training periods you've defined |

### 3. Storage (Your Photos)
When you attach a photo to a session:
- The photo is uploaded to secure cloud storage
- A thumbnail is automatically created for faster loading
- You can delete photos anytime

---

## How Your Data is Organised

### The Hierarchy (Biggest to Smallest)

```
YOU (your account)
│
├── 🏋️ Routines (your training templates)
│   ├── "8×50m DYN CO₂ Table"
│   ├── "STA Progression"
│   └── "My Custom Warmup"
│
├── 📝 Session Logs (individual training records)
│   ├── "Morning pool session - 15 Jan"
│   │   ├── DYN 152m (logged routine)
│   │   └── STA 4:30 (logged routine)
│   │
│   └── "Evening training - 16 Jan"
│       └── DNF 75m
│
├── 🏆 Personal Bests (automatic tracking)
│   ├── STA: 5:23
│   ├── DYN: 175m
│   ├── DNF: 87m
│   └── DYNB: 156m
│
└── 📅 Seasons (training periods)
    ├── "Pre-comp buildup 2025"
    └── "Recovery phase"
```

### What Gets Saved When You Log a Dive

When you log a training session, here's what can be recorded:

**Basic Info:**
- Date and time
- Which discipline (STA, DYN, DNF, DYNB)
- Distance or time achieved
- Pool length

**Performance Details (optional):**
- Lap-by-lap times
- Kicks per lap
- Arm pulls per lap (for DNF)
- Rest between reps
- Breathe-up time

**How You Felt:**
- RPE (Rate of Perceived Exertion) 1-10
- Joy Scale 1-10
- Hours since last meal
- Notes about the dive

**Media:**
- Session photo (with cropping)
- YouTube video link

---

## Routines: Templates vs Logs

### Routine Templates (The Recipe)
A routine template is like a recipe - it defines what a workout should look like:
- "8 reps of 50m DYN"
- "45 seconds rest between reps"  
- "Track lap times and kicks"

You create templates once and reuse them forever.

### Routine Logs (The Execution)
A routine log is what you actually did:
- "I did the 8×50m DYN routine today"
- "I completed 7 out of 8 reps"
- "Here are my exact times..."

Every time you train, you create a new log based on a template.

---

## Privacy & Visibility

You control who sees your training:

| Visibility | Who Can See |
|------------|-------------|
| **Private** | Only you |
| **Friends** | People you've connected with |
| **Public** | Anyone browsing the app |

By default, everything is private.

---

## Personal Bests (PBs)

The app automatically tracks your best performances:

- **When you log a new dive**, it checks if you've beaten your PB
- **PBs are tracked per discipline** (STA, DYN, DNF, DYNB)
- **You can view PB history** to see how you've progressed

Example: If your current DYN PB is 150m and you log a 165m dive, the app automatically:
1. Updates your DYN PB to 165m
2. Records when this happened
3. Shows it in your analytics

---

## Importing Data (AIDA Results)

If you've competed in AIDA competitions, you can import your official results:

1. Download your results as a spreadsheet from the AIDA website
2. Upload the file in the Import section
3. The app creates session logs for each competition dive
4. Your PBs are automatically updated

You can also "undo" an import if something went wrong.

---

## Technical Details (For the Curious)

**Firebase Project:** overdive-dreaming-fb  
**Database:** Google Cloud Firestore (NoSQL)  
**Storage:** Google Cloud Storage (for photos)  
**Authentication:** Google Sign-In  

All data is encrypted in transit and at rest. Your data is stored in Google's secure data centres.

---

## Common Questions

**Q: What happens if I delete the app?**  
A: Your data stays safe in the cloud. Just sign back in to access it.

**Q: Can I export my data?**  
A: This feature is planned but not yet available.

**Q: Is my data shared with anyone?**  
A: Only if you explicitly make sessions public. We don't sell or share data.

**Q: What if I lose internet connection?**  
A: The app needs internet to sync. Changes made offline may not save.

---

*Last updated: January 2026*
