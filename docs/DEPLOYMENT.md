# VPS Deployment Guide

This guide details how to self-host **Privacy Tracker** on a standard Ubuntu
Linux VPS using **Caddy**, **Node.js**, and **PM2**. For containerized hosting,
see the [Docker Deployment Guide](DOCKER.md).

## Prerequisites

- An Ubuntu VPS (Ubuntu 22.04 LTS or newer)
- Node.js 20+; Node.js 24 LTS is recommended for this project
- Caddy Server installed and running as a reverse proxy
- A domain or subdomain pointed to your VPS, such as `analytics.example.com`

---

## Step 1: Clone and Set Up Code

On the VPS, clone the repository to your preferred application directory:

```bash
git clone https://github.com/icarus-online/trackmeprivately.git /opt/trackmeprivately
cd /opt/trackmeprivately
npm ci
```

---

## Step 2: Configure Environment Variables

Create and edit the `.env` file:

```bash
nano .env
```

Populate the `.env` file with the SQLite database URL, a strong session secret,
WebAuthn host/origin constraints, and optional session cookie settings:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="choose-a-strong-random-key"
ALLOWED_RP_ID="analytics.example.com"
ALLOWED_RP_ORIGIN="https://analytics.example.com"

# Optional session hardening. Defaults shown.
SESSION_MAX_AGE="2592000"
SESSION_COOKIE_SAME_SITE="lax"
# SESSION_COOKIE_DOMAIN=".example.com"
```

Generate a strong secret with:

```bash
openssl rand -base64 32
```

`SESSION_MAX_AGE` is measured in seconds and controls both the signed JWT
expiration and the `session_token` cookie lifetime. `SESSION_COOKIE_SAME_SITE`
accepts `lax`, `strict`, or `none`; `strict` is appropriate when the admin
panel is only used directly on the analytics domain. Leave
`SESSION_COOKIE_DOMAIN` unset unless you intentionally need to share the admin
session across a parent domain.

---

## Step 3: Run Database Migrations

Apply the Prisma schema to build your local SQLite database:

```bash
npx prisma db push
```

---

## Step 4: Build the Production App

```bash
npm run build
```

---

## Step 5: Run with PM2

Install **PM2** globally to manage the Node.js process and ensure it starts up
after server reboots:

```bash
sudo npm install -g pm2
pm2 start npm --name "trackmeprivately" -- start
pm2 save
pm2 startup
```

Follow any system commands printed by `pm2 startup` to configure the service.

---

## Step 6: Configure Caddy Reverse Proxy

Edit your VPS Caddyfile, usually at `/etc/caddy/Caddyfile`:

```caddy
analytics.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy to apply changes:

```bash
sudo systemctl reload caddy
```

---

## Step 7: Create the First Admin

With an empty database, the app logs a setup token and writes it to
`prisma/setup_token.txt`. Visit `https://analytics.example.com/login`, enter the
setup token, and register the first admin passkey. The setup token is deleted
after registration.

---

## Step 8: Create the First Website

Add a Website record in the dashboard, copy the generated tracking snippet, and
embed it into the static website you want to track.

---

## Privacy Disclosures

Before embedding the tracker on a public site, review
[Privacy Policy Guidance](PRIVACY.md) and adapt the suggested disclosure text
for the tracked website's privacy policy.
