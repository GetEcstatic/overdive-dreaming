# Overdive Dreaming

A freediving training tracker focused on pool disciplines. Track your progress, log dives, and analyze your performance over time.

## Features

- **Google Authentication** - Sign in securely with your Google account
- **Dive Logging** - Record STA, DYN, DNF, and DYNB dives
- **Progress Tracking** - View your improvements over 1 month, 6 months, and 1 year
- **Analytics Dashboard** - Visualize your training data
- **Mobile-First Design** - Optimized for use on your phone
- **Dark Theme** - Modern teal/green color scheme

## Tech Stack

- **SvelteKit** - Full-stack web framework
- **Tailwind CSS v4** - Utility-first styling
- **Firebase** - Authentication and Firestore database
- **TypeScript** - Type-safe development

## Getting Started

### Prerequisites

- Node.js 18+ and npm installed
- A Firebase project (free tier works great)

### Setup Instructions

1. **Clone and install dependencies**
   ```bash
   cd overdive-dreaming
   npm install
   ```

2. **Set up Firebase**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project (or use existing)
   - Enable Google Authentication:
     - Go to Authentication > Sign-in method
     - Enable Google as a sign-in provider: done - project-515149378190
   - Create a Firestore database:
     - Go to Firestore Database
     - Create database (start in test mode for development)
   - Get your Firebase config:
     - Go to Project Settings > General
     - Scroll to "Your apps" and add a web app
     - Copy the Firebase SDK configuration

Instructions from Firebase:
npm install firebase

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDZWIyoOYi-Xi0hjGDjqqbm9Sgbbj8Nlec",
  authDomain: "overdive-dreaming-fb.firebaseapp.com",
  projectId: "overdive-dreaming-fb",
  storageBucket: "overdive-dreaming-fb.firebasestorage.app",
  messagingSenderId: "515149378190",
  appId: "1:515149378190:web:157a8bc55688993c21cfdf",
  measurementId: "G-8PX6D8ZW9C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your Firebase credentials from the config above

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your values:
   ```
   PUBLIC_FIREBASE_API_KEY=your-api-key
   PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
   PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser

## Project Structure

```
overdive-dreaming/
├── src/
│   ├── lib/
│   │   ├── components/     # Reusable components
│   │   │   └── BottomNav.svelte
│   │   ├── stores/         # Svelte stores
│   │   │   └── auth.ts
│   │   └── firebase.ts     # Firebase configuration
│   ├── routes/
│   │   ├── (app)/          # Authenticated routes
│   │   │   ├── dashboard/
│   │   │   ├── dives/
│   │   │   ├── analytics/
│   │   │   ├── profile/
│   │   │   └── +layout.svelte
│   │   ├── +layout.svelte  # Root layout
│   │   └── +page.svelte    # Landing/login page
│   └── app.css             # Global styles & theme
├── static/                 # Static assets
└── package.json
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run check` - Run TypeScript checks

## Firebase Security Rules

Before deploying to production, update your Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /dives/{diveId} {
      allow read, write: if request.auth != null &&
        request.auth.uid == resource.data.userId;
    }
  }
}
```

## Roadmap

- [x] Implement Firestore integration for dive logging
- [ ] Add charts for analytics visualization
- [ ] Create sharing functionality
- [ ] Add profile customization
- [ ] Implement dive history and filtering
- [ ] Add competition mode tracking
- [ ] Social features (follow, compare with friends)
- [ ] Export data functionality
- [ ] Migration to custom Zef DB (future)

## License

ISC
