# Quizora AI — Vercel project

This project contains the Quizora front end, Vercel API function, offline app shell, and a database that is initialised automatically.

## Important files
- `index.html` — the main application (HTML, CSS and browser JavaScript in one file).
- `api/index.js` — secure server-side API for accounts, administrator actions, content and subscriptions.
- `sw.js` — caches the application shell so it can reopen offline.
- `manifest.webmanifest` — allows installation as a phone app.
- `package.json` — server dependencies.

## Deploy from GitHub to Vercel

1. Upload the contents of this folder to the root of a new GitHub repository. Keep the `api` folder and its `index.js` file.
2. In Vercel, import that GitHub repository. The project can use the default settings; no build command is required.
3. In the Vercel project, open **Storage / Marketplace** and install **Neon Postgres**. Choose the option to create a new database. Vercel will add `DATABASE_URL` to the project.
4. In Vercel **Settings → Environment Variables**, add:
   - `ADMIN_SETUP_KEY` — a long private setup key you choose.
   - `SESSION_SECRET` — a different long random secret (at least 32 random characters).
   Apply both to Production (and Preview if you intend to use Preview).
5. Redeploy after adding the database and environment variables.
6. Open your live site, select **Administrator**, and complete the first-time setup using `ADMIN_SETUP_KEY`. Choose a strong administrator password. Keep the setup key private.

Neon is a Postgres integration available through Vercel Marketplace. Vercel Functions run the API code. The database tables are created automatically on the first API request.

## First use

- Create the administrator account.
- Sign in as administrator and add subjects and topics.
- Tick a class and a subject to set the destination for new topics.
- Add a phrase or add a separate note. Add diagrams from the topic editor.
- Students create accounts and sign in from the student tab.
- Use **Save lessons offline** while connected to download the current learning library to the student's browser cache.

## Offline behaviour and limitations

- The app shell is cached by the service worker.
- After a student signs in and downloads content, the cached learning library is kept in browser storage and the app can reopen offline on that same browser/device.
- Student offline access is a local convenience, not an offline server login. Account creation, sign-in, subscription verification, new content and administrator changes require internet.
- If a student clears browser storage, uses private browsing, or changes device/browser, the local downloaded content is lost and must be downloaded again.
- New content and subscription changes reach devices when they next connect and synchronise.
- Premium access is checked by the server when the student downloads the library. The current code shows JSS1, JSS2, SS1 and SS2 as free; JSS3, SS3, WAEC and JAMB require an active subscription.
- The administrator currently grants subscriptions manually from the Students screen. Payment verification is not integrated.
- The smart phrase placement is a local heuristic, not a language-understanding guarantee. Review the suggested placement and edit the text if necessary.
- Diagram uploads are limited to 2 MB each in this starter build. For a large library of high-resolution images, use object storage rather than storing image data in Postgres.
- Device binding is a basic device identifier and can be reset only by implementing a dedicated admin action; browser storage reset can change the identifier. It is not a substitute for high-assurance device security.

## Important
Do not publish `ADMIN_SETUP_KEY`, `SESSION_SECRET`, database connection strings, or passwords in GitHub. They belong only in Vercel Environment Variables.
