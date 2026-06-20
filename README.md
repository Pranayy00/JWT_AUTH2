<div align="center">

# 🔐 JWT Authentication & Authorization API

### A complete, production-style auth backend built with Node.js & Express

*JWT Access/Refresh Tokens · Role-Based Access Control · Email Verification · Rate Limiting · Login Activity Tracking*

</div>

---

## 📑 Table of Contents

- [📖 Overview](#-overview)
- [✨ Features](#-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
- [📧 Email Verification (Dev Setup)](#-email-verification-dev-setup)
- [📡 API Reference](#-api-reference)
- [💻 Example Requests](#-example-requests)
- [🔄 Authentication Flow](#-authentication-flow)
- [⏱️ Rate Limiting](#️-rate-limiting)
- [🔒 Security Notes](#-security-notes)
- [🧭 Known Limitations / Roadmap](#-known-limitations--roadmap)
- [📄 License](#-license)
- [👤 Author](#-author)

---

## 📖 Overview

This project implements a complete authentication system from scratch — no auth-as-a-service, no third-party SDKs for the core logic. It covers the pieces most fresher-level tutorials skip: refresh token handling, RBAC middleware, rate limiting, and audit logging of login attempts.

It uses an **in-memory data store** by design, so it runs instantly with zero database setup — ideal for demos, interviews, and learning. Swapping in MongoDB/PostgreSQL later only touches the data-access lines, not the auth logic itself.

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| ✅ | **Email-verified registration** | New accounts stay inactive until the user clicks a verification link |
| ✅ | **Access + refresh tokens** | Short-lived access token (15 min) paired with a 7-day refresh token |
| ✅ | **Token refresh** | Get a new access token without re-entering credentials |
| ✅ | **Logout** | Revokes a specific refresh token on demand |
| ✅ | **Forgot / reset password** | Time-limited reset tokens (30 min) with email-enumeration protection |
| ✅ | **RBAC** | `user` and `admin` roles enforced via middleware |
| ✅ | **Verified-only routes** | Sensitive endpoints require a verified account |
| ✅ | **Admin dashboard** | View every registered user at a glance |
| ✅ | **Login activity tracking** | Every login attempt logged with IP, user agent, and timestamp |
| ✅ | **Personal login history** | Users can view their own recent login activity |
| ✅ | **Rate limiting** | Tighter limits on auth routes vs. general API traffic |
| ✅ | **Dev-friendly email testing** | Ethereal Email previews every sent email in-browser — no real SMTP needed |

---

## 🛠️ Tech Stack

| Layer | Library |
|---|---|
| Server framework | Express |
| Authentication | jsonwebtoken |
| Password hashing | bcryptjs |
| Email (dev) | nodemailer (Ethereal SMTP) |
| Rate limiting | express-rate-limit |
| Secure tokens | crypto (Node built-in) |
| Config | dotenv |

---

## 📁 Project Structure

```
.
├── server.js          # Main application file (all routes & middleware)
├── public/            # Static front-end (Bootstrap UI) for manual testing
├── .env                # Environment variables (not committed)
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js v16+
- npm

### Installation

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install express jsonwebtoken bcryptjs nodemailer express-rate-limit dotenv
```

### Environment Variables

Create a `.env` file in the project root:

```env
JWT_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
BASE_URL=http://localhost:5000
```

> ⚠️ **Note:** If these aren't set, the app falls back to hardcoded development defaults. Fine for local testing — **never use the fallback values in production.**

### Run the Server

```bash
node server.js
```

For auto-restart on file changes during development:

```bash
npx nodemon server.js
```

The server starts at **`http://localhost:5000`** and logs all available routes to the console on boot.

---

## 📧 Email Verification (Dev Setup)

This project uses **Ethereal Email**, a fake SMTP inbox built for testing — no real email account required.

> 💡 **Tip:** Every time an email is "sent" (registration or password reset), check the response or your terminal for a `previewUrl`. Opening that link shows exactly what the email would have looked like.

```
📧 Ethereal test account created: someuser@ethereal.email
 To      : user@example.com
 Subject : Verify Your Email Address
 Preview : https://ethereal.email/message/xxxxxxxx
```

The `/register` and `/forgot-password` responses also include the **direct link** (`verifyLink` / `resetLink`), so you can test the full flow in Postman without ever opening an inbox.

To go live in production, swap the `getTransporter()` logic for real SMTP credentials (Gmail, SendGrid, Mailgun, etc.).

---

## 📡 API Reference

### 🔑 Auth Routes

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/register` | Create a new account, sends verification email | — |
| `GET` | `/verify-email?token=...` | Verify email using the token from the email | — |
| `POST` | `/login` | Authenticate, returns access + refresh tokens | — |
| `POST` | `/refresh-token` | Exchange a valid refresh token for a new access token | — |
| `POST` | `/logout` | Revoke a refresh token | — |
| `POST` | `/forgot-password` | Request a password reset email | — |
| `POST` | `/reset-password` | Reset password using the token from the email | — |

### 👤 User Routes

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/profile` | Get the logged-in user's profile | Access token + verified |
| `GET` | `/my-activity` | View your own last 20 login attempts | Access token + verified |

### 🛡️ Admin Routes

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/admin/dashboard` | List all registered users | Access token + verified + `admin` role |
| `GET` | `/admin/login-activity` | Paginated log of every login attempt (`?page=&limit=`) | Access token + verified + `admin` role |

---

## 💻 Example Requests

<details>
<summary><b>📝 Register a new user</b></summary>

```bash
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "password": "SecurePass123"}'
```

</details>

<details>
<summary><b>🔓 Login</b></summary>

```bash
curl -X POST http://localhost:5000/login \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "password": "SecurePass123"}'
```

**Response:**

```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

</details>

<details>
<summary><b>👤 Access a protected route</b></summary>

```bash
curl http://localhost:5000/profile \
  -H "Authorization: Bearer <accessToken>"
```

</details>

<details>
<summary><b>🔄 Refresh an expired access token</b></summary>

```bash
curl -X POST http://localhost:5000/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

</details>

---

## 🔄 Authentication Flow

```
 Register → Verify Email → Login
                              │
                              ▼
              Access Token (15m)  +  Refresh Token (7d)
                              │
                  access token expires
                              ▼
            POST /refresh-token  →  New Access Token
                              │
                          Logout
                              ▼
                Refresh Token Revoked Immediately
```

Roles are assigned **server-side only** — every new user defaults to `role: "user"`, and the value is never taken from client input, so a request body can't grant itself elevated access.

---

## ⏱️ Rate Limiting

| Limiter | Scope | Limit |
|---|---|---|
| `authLimiter` | `/register`, `/login`, `/forgot-password` | 10 requests / 15 minutes per IP |
| `generalLimiter` | All other routes | 60 requests / minute per IP |

---

## 🔒 Security Notes

- Passwords are hashed with **bcrypt** (10 salt rounds) — plaintext passwords are never stored
- `/forgot-password` returns an identical response whether or not the email exists, preventing account enumeration
- Resetting a password **revokes all existing refresh tokens** for that user, logging out every active session
- Role is hardcoded to `"user"` at registration time and cannot be set by the client
- Sensitive routes require both a valid access token **and** a verified email address

---

## 🧭 Known Limitations / Roadmap

<details>
<summary>Click to expand</summary>

- **In-memory storage** — all data (`users`, `refreshTokens`, `loginActivity`) resets on server restart. Swap in MongoDB/PostgreSQL for persistence.
- **No refresh token rotation** — the same refresh token stays valid until it expires or is explicitly revoked, rather than being rotated on each use.
- **No admin-creation flow** — the first admin account currently has to be set manually in the data store; there's no promote/demote endpoint.
- **Verification links don't expire** — by design for this demo; add an expiry timestamp similar to the password reset flow for production use.

</details>

---

## 📄 License

MIT — feel free to use this as a learning reference or a starting point for your own project.

## 👤 Author

**Pranay**
Fresher Full Stack Developer (MERN)

> 📫 Feel free to connect or open an issue with feedback / suggestions!

</div>
