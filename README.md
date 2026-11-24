# Quizora AI — Vercel Project

Quizora AI is an offline-capable learning platform for **JSS1–SS3**, **WAEC**, and **JAMB**, built with a single-page front end, a Vercel serverless API backed by Neon Postgres, and a service worker + local storage cache for offline study.

## Important Files

* `index.html` — Main application UI, role/view switching, topic/content authoring, `.docx` and photo uploads, subscription/PIN modal, admin financial view, and offline state handling.
* `api/index.js` — Serverless API routes and automatic Neon Postgres schema initialization (`q_users`, `q_classes`, `q_subjects`, `q_topics`, `q_content`, `q_diagrams`, `q_subscriptions`, `q_pins`, and `q_announcements`).
* `sw.js` — Service worker that caches the application shell and assets for offline loading.
* `manifest.webmanifest` — Web app manifest for installing Quizora AI on mobile and desktop devices.
* `package.json` — Node.js dependencies (`@neondatabase/serverless` and `bcryptjs`).
* `README.md` — Project setup, architecture, and deployment guide.

## Key Features

* **Admin ↔ Student View Switching**: Administrators can switch to Student view to test or browse the student experience and switch right back to Administrator view.
* **Paid Sections & Non-Transferable PINs**: **JSS3**, **SS3**, **WAEC**, and **JAMB** are gated at **₦2,000 per locked section per month**. Students pay into **OPay `8147699555` (Ekpo Bassey)**, send payment proof to **WhatsApp `08147699555`**, and redeem a non-transferable PIN generated from the Admin **Financial** section.
* **Flexible Content Authoring**: Add **topics only** (to fill later) or **topics with notes**, with **Edit**, **Delete**, **Type**, **Upload Photos**, and **Upload File (`.docx` / `.txt` / `.md`)** controls.
* **Sticky Topic Tick & Smart Placement**: Selecting a class and ticking a topic keeps the checkbox ticked until unticked, automatically placing typed lines, phrases, subtopics, and uploaded photos into matching sections/paragraphs on save.
* **Profile Photos & Global Admin Avatar**: Both students and administrators can upload profile photos, and the administrator's photo is displayed in the top-right header of every dashboard.
* **Offline Access After Initial Setup**: Once a user creates an account/signs in and syncs lessons, cached lessons, profile data, and unlocked subscriptions remain accessible offline on that device without mobile data.

## Deploy from GitHub to Vercel

1. Push the repository files (`index.html`, `api/index.js`, `sw.js`, `manifest.webmanifest`, `package.json`, and `README.md`) to your GitHub repository (`ekpobassey01-glitch/quizora-ai`).
2. Import the repository into **Vercel** (no build command is required).
3. In Vercel **Storage / Marketplace**, connect **Neon Postgres** so `DATABASE_URL` is added to your environment.
4. In **Vercel Settings → Environment Variables**, configure:
   * `ADMIN_SETUP_KEY` — Private setup key for creating the initial administrator account.
   * `SESSION_SECRET` — Strong random secret (at least 32 characters) for signing session cookies.
5. **Redeploy** the project on Vercel (with **Use existing Build Cache** unchecked when pushing major updates).
6. Open your live site, select **Administrator**, and complete first-time setup using `ADMIN_SETUP_KEY`.

## Security Reminder

Never commit `ADMIN_SETUP_KEY`, `SESSION_SECRET`, database connection strings (`DATABASE_URL` / `POSTGRES_URL`), or passwords into GitHub. Store them only in Vercel Environment Variables.
