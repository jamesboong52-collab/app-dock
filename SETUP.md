# Putting App Dock online (one-time setup, about 15 minutes)

You need two free accounts: **GitHub** (hosts the website) and **Firebase** (sign-in + saving your data so phone and computer stay in sync).

## Part 1 · Firebase (your data)

1. Go to **console.firebase.google.com** and sign in with your Google account.
2. **Create a project** → name it `app-dock` → you can turn Google Analytics **off** → Create.
3. **Sign-in:** left menu **Build → Authentication → Get started** → **Sign-in method** → **Google** → turn on **Enable** → pick your email as support email → **Save**.
4. **Database:** **Build → Firestore Database → Create database** → choose a location near you (e.g. `eur3 (europe-west)`) → **Start in production mode** → Create.
5. Still in Firestore, open the **Rules** tab, delete what's there, paste the contents of `firestore.rules` from this folder, click **Publish**. (This makes sure only you can read your data.)
6. **Get your settings:** click the gear ⚙ next to "Project overview" → **Project settings** → scroll to **Your apps** → click the **`</>`** (Web) icon → nickname `App Dock` → **Register app** (leave "Firebase Hosting" unticked). You'll see a block `const firebaseConfig = { apiKey: ..., authDomain: ..., ... }`. **Copy that block and send it to Claude** (these values aren't secret, they only name your project). Claude puts them into `config.js`.

## Part 2 · GitHub (the website)

1. Create an account at **github.com** (pick a username you like; it becomes part of the address).
2. Top right **+ → New repository** → name: `app-dock` → **Public** → Create repository.
3. On the empty repo page click **"uploading an existing file"** → unzip `app-dock-website.zip` and drag **everything inside** it (all files plus the `ml` and `vendor` folders) into the box → **Commit changes**. The upload can take a minute (the AI model files are ~25 MB).
4. **Settings → Pages** → under "Build and deployment": Source **Deploy from a branch**, Branch **main** and **/ (root)** → **Save**.
5. After ~1 minute your site is at **https://YOUR-USERNAME.github.io/app-dock/**

## Part 3 · Connect the two

1. Firebase → **Authentication → Settings → Authorized domains → Add domain** → `YOUR-USERNAME.github.io` → Add.
2. Open your site, **Sign in with Google**.
3. Move your data over: in the Claude version of App Dock, scroll to the bottom of the home screen → **Back up my data** (saves a `.json` file). On the website → **Restore a backup** → pick that file.

**Phone:** open the site in Safari/Chrome → Share → **Add to Home Screen**. It opens like an app.

## Updating later

Ask Claude for a change as usual. Two ways it gets onto the website:

- **Automatic (recommended):** give Claude a GitHub token that can only touch this one repository. GitHub → your picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** → Repository access: **Only select repositories → app-dock** → Permissions → Repository permissions → **Contents: Read and write** → Generate. Paste the token to Claude when you want an update pushed. You can delete it anytime on the same page.
- **By hand:** Claude sends you the new `index.html`; in your repo click **Add file → Upload files**, drop it in, **Commit changes**.

The code in the repo is public, but your data is not: it lives in your Firebase account and only your Google login can read it.
