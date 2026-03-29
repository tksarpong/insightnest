# InsightNest — Setup Guide

A mobile-first PWA that reads and writes directly to your Google Sheet.
Works in any browser. Install on phone home screen for an app-like experience.

---

## Step 1 — Set up Google Cloud Console (one time only)

1. Go to https://console.cloud.google.com
2. Click "Select a project" → "New Project" → name it "InsightNest" → Create
3. In the left menu go to: APIs & Services → Library
4. Search "Google Sheets API" → click it → click Enable
5. Go to: APIs & Services → Credentials
6. Click "Create Credentials" → "OAuth client ID"
7. If prompted, click "Configure Consent Screen" first:
   - Choose "External" → Create
   - App name: InsightNest
   - User support email: your email
   - Developer contact: your email
   - Save and Continue through all steps
   - Back on Credentials → Create Credentials → OAuth client ID
8. Application type: "Web application"
9. Name: InsightNest
10. Under "Authorised JavaScript origins" add:
    - http://localhost (for local testing)
    - https://yourdomain.netlify.app (your actual deployed URL)
11. Click Create
12. Copy the "Client ID" — it looks like: 123456789-abc.apps.googleusercontent.com

---

## Step 2 — Add your Client ID to the app

Open `app.js` and replace line 3:

```js
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

Replace with your actual Client ID:

```js
const CLIENT_ID = '123456789-abcdef.apps.googleusercontent.com';
```

---

## Step 3 — Set up your Google Sheet

1. Go to https://sheets.google.com → create a new spreadsheet
2. Name it "InsightNest Business Tracker" (or anything you like)
3. Create two sheets (tabs at the bottom):
   - Rename "Sheet1" to: **Sales**
   - Add a new tab: **Expenses**
4. The app will add headers automatically on first use.
   Or add them manually:
   - Sales row 1: DATE | CUSTOMER | PRODUCT/ITEM | UNIT PRICE | QUANTITY | DISCOUNT | TOTAL | PAYMENT STATUS
   - Expenses row 1: DATE | METHOD OF PAYMENT | DESCRIPTION | CATEGORY | AMOUNT PAID | PAYMENT STATUS
5. Copy the Sheet ID from the URL:
   https://docs.google.com/spreadsheets/d/**[COPY THIS PART]**/edit
6. Share the Sheet with each staff member's Google account (give them Editor access)

---

## Step 4 — Deploy to Netlify (free)

1. Go to https://netlify.com → sign up free
2. Drag and drop your insightnest folder onto the Netlify dashboard
3. Netlify gives you a URL like: https://insightnest-abc123.netlify.app
4. Go back to Google Cloud Console → Credentials → your OAuth client
5. Add this Netlify URL to "Authorised JavaScript origins" → Save
6. Share the Netlify URL with your owner and staff

---

## Step 5 — Connect the Sheet in the app

1. Open the app URL in your browser
2. Sign in with Google
3. Paste your Sheet ID when prompted (or go to Settings tab)
4. Done — every sale and expense you record goes straight to the Sheet

---

## Step 6 — Install on mobile (make it feel like an app)

**Android (Chrome):**
1. Open the app URL in Chrome
2. Tap the 3-dot menu → "Add to Home screen"
3. Tap Add — it appears on your home screen like an app

**iPhone (Safari):**
1. Open the app URL in Safari
2. Tap the Share button (box with arrow)
3. Scroll down → "Add to Home Screen"
4. Tap Add

---

## Sharing with staff

Each staff member needs to:
1. Have a Google account
2. Be added as an Editor on the Google Sheet (you share it with their email)
3. Open the app URL and sign in with their Google account
4. Enter the Sheet ID (you can tell them this, or pre-fill it in app.js)

---

## Customising products and categories

Open the app → Settings tab → edit the Products and Expense Categories lists.
These are saved locally on each device, so each staff member sets them once.

Or hard-code the defaults in app.js line 11-12:
```js
let products = ['Your Product A', 'Your Product B'];
let categories = ['Rent', 'Salaries', 'Transport'];
```

---

## Files in this project

| File | Purpose |
|------|---------|
| index.html | App structure |
| style.css | All styling (dark green theme) |
| app.js | All logic + Google Sheets API |
| manifest.json | PWA configuration |
| sw.js | Service worker (offline support) |
| README.md | This file |

---

## Troubleshooting

**"Sign in failed"** — Check your Client ID in app.js and that your URL is in the Authorised JavaScript origins list in Google Cloud Console.

**"Could not load data"** — Check your Sheet ID is correct in Settings. Make sure the Sheet has tabs named exactly "Sales" and "Expenses".

**"Failed to save"** — The signed-in Google account must have Editor access to the Sheet.

**Blank screen** — Open browser DevTools (F12) → Console tab to see error messages.
