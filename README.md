# The Good Treasurer

A clean, private personal expense tracker built with **Vite + React + Tailwind CSS v4** and
**Firebase v12** (Authentication + Firestore).

## Features

- Google sign-in via Firebase Authentication (popup flow).
- Personal expense ledger stored in Firestore at `users/{user.uid}/expenses`.
- Live updates: the expense list streams in real time via `onSnapshot`.
- Summary cards for total spend, current-month spend, and entry count.
- Add and delete expenses, with category, amount, and date.

## Getting started

```bash
npm install
npm run dev
```

## Environment variables

Create a `.env.local` file in the project root (it is git-ignored). The app reads its Firebase
configuration from these `import.meta.env.VITE_FIREBASE_*` variables:

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

If any of these are missing the app renders a setup notice instead of crashing.

## Firebase setup

1. In the [Firebase console](https://console.firebase.google.com/), enable **Google** under
   Authentication → Sign-in method.
2. Add `localhost` to Authentication → Settings → Authorised domains.
3. Create a Firestore database.
4. Secure the data with rules that scope reads and writes to the signed-in owner:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Scripts

| Script          | Description                       |
| --------------- | --------------------------------- |
| `npm run dev`   | Start the Vite dev server         |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build    |
| `npm run lint`  | Run oxlint over the source        |

## Project structure

```
src/
  components/   LoginScreen, Dashboard, ExpenseForm, ExpenseList, icons
  hooks/        useAuth — Firebase auth state and sign-in/out
  lib/          firebase (init), expenses (Firestore CRUD), format, types
  App.tsx       Routes between the login screen and the dashboard
```
