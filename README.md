# Privacy Tracker

![Privacy Tracker Banner](./public/banner.jpg)

A privacy-focused, zero-cookie, open-source analytics platform designed for lightweight self-hosting. Track page views, referrers, devices, and custom events on your websites without cookie banners or long-lived user profiles.

## Core Philosophy & Privacy Design

Unlike traditional analytics tools that build long-term user profiles and require intrusive cookie consent banners, **Privacy Tracker** keeps collection intentionally narrow:

1. **No Cookies / LocalStorage**: The client-side script does not read, write, or require local browser cookies or storage.
2. **Anonymized Sessions**: The server discards the raw IP address immediately. It generates a daily-rotating session hash using:
   `SHA256(IP + UserAgent + WebsiteID + DailyDateSalt)`
   This allows daily unique-visitor counts without building persistent cross-day identity profiles.
3. **Vanilla JS Tracker**: The tracking script is tiny, dependency-free, and non-blocking.

For disclosure language and implementation notes, see [Privacy Policy Guidance](docs/PRIVACY.md). For the project audit and future milestones, see [Development Roadmap](docs/ROADMAP.md).

## Features

- **Multi-Site Dashboard**: Track multiple domain configurations under a single dashboard.
- **Real-Time Telemetry**: View page views, top pages, referrers, browser breakdowns, and custom events.
- **Easy Self-Hosting**: Built with Next.js, Prisma, and SQLite for lightweight VPS deployments.
- **Container Ready**: Run with Docker Compose using a persistent SQLite volume.
- **SQLite First**: The default schema uses SQLite. PostgreSQL is possible later, but requires a Prisma provider/schema migration rather than only changing an environment variable.
- **Passwordless Admin Access**: Log in with passkeys through WebAuthn/FIDO2. First admin registration is protected by a one-time setup token.

---

## Getting Started

### 1. Installation

```bash
git clone https://github.com/icarus-online/trackmeprivately.git
cd trackmeprivately
npm ci
```

### 2. Configure Database & Environment

Create a `.env` file in the root of the project:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="replace-with-a-strong-random-secret"

# WebAuthn Host/Origin Constraints
ALLOWED_RP_ID="localhost"
ALLOWED_RP_ORIGIN="http://localhost:3000"
```

For production, set `ALLOWED_RP_ID` to the analytics host, such as
`analytics.example.com`, and `ALLOWED_RP_ORIGIN` to the exact HTTPS origin.

Sync the database schema:

```bash
npx prisma db push
```

### 3. Build & Run

```bash
npm run build
npm start
```

For local development, use:

```bash
npm run dev
```

Docker users can follow the [Docker Deployment Guide](docs/DOCKER.md).

### 4. Create the First Admin

On first boot with an empty database, the app logs a setup token and writes it to
`prisma/setup_token.txt`. Visit `/login`, enter the token, and register a
passkey. The setup token is deleted after the first user is created.

---

## Client Integration

Embed this code in the `<head>` or before `</body>` of the websites you want to track:

```html
<script
  src="https://your-analytics-domain.com/tracker.js"
  data-endpoint="https://your-analytics-domain.com/api/collect"
  data-website-id="YOUR_WEBSITE_ID"
  async
></script>
```

---

## Developer & Agent Context

This repository includes an [AGENTS.md](AGENTS.md) file in the root directory. It contains directory structure, database schema notes, authentication flow details, and coding standards for human developers and AI coding agents.

---

## License

This project is open-source and available under the [MIT License](LICENSE).
