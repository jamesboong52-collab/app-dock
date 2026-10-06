# App Dock

Bantiflok's personal hub of small apps: Habits, Planner (to-do + calendar), Fitting Room, Wishlist and Shelf.

- `index.html`: the whole app (built from the Claude artifact source, don't edit by hand)
- `config.js`: your Firebase project settings
- `dock-firebase.js`: sign-in and cloud saving (Firebase Auth + Firestore)
- `firestore.rules`: who can read what (only you can read your own data)
- `ml/`: the AI model that cuts the background out of clothing photos
- `vendor/`: Firebase library files

Updates are made with Claude and pushed to this repository; GitHub Pages publishes them in about a minute.
