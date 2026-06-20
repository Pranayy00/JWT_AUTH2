
require("dotenv").config();
const express    = require("express");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto     = require("crypto");
const rateLimit  = require("express-rate-limit");

const app = express();
app.use(express.json());

app.use(express.static("public"));

// ─── SECRETS (pulled from .env) ──────────────────────────────
const JWT_SECRET         = process.env.JWT_SECRET         || "mysecretkey123";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "myrefreshsecret456";
const BASE_URL           = process.env.BASE_URL           || "http://localhost:5000";

// ─── FAKE IN-MEMORY DATABASE ──────────────────────────────────
const users         = [];   // { id, email, password, role, isVerified, verificationToken, resetToken, resetTokenExpiry }
let   refreshTokens = [];   // valid refresh tokens
const loginActivity = [];   // { userId, email, ip, userAgent, timestamp, success }

// ─── NODEMAILER SETUP (Ethereal — no real email needed) ──────
let transporter = null;

async function getTransporter() {
    if (transporter) return transporter;

    const testAccount = await nodemailer.createTestAccount();

    transporter = nodemailer.createTransport({
        host  : "smtp.ethereal.email",
        port  : 587,
        secure: false,
        auth  : {
            user: testAccount.user,
            pass: testAccount.pass,
        },
    });

    console.log("\n📧 Ethereal test account created:", testAccount.user);
    return transporter;
}

async function sendEmail(to, subject, html) {
    const t    = await getTransporter();
    const info = await t.sendMail({
        from: '"Auth App" <noreply@authapp.com>',
        to,
        subject,
        html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    // ── Very visible terminal output ──
    console.log(` To      : ${to}`);
    console.log(` Subject : ${subject}`);
    console.log(` Preview : ${previewUrl}`);
    // ✅ BUG FIX 1: Removed stray `c` that caused ReferenceError

    return previewUrl;   // also returned in API response
}

// ─── RATE LIMITER ───────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs       : 15 * 60 * 1000,
    max            : 10,
    message        : { message: "Too many requests. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders  : false,
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max     : 60,
    message : { message: "Rate limit exceeded. Slow down!" },
});

app.use(generalLimiter);

// ─── HELPER: TRACK LOGIN ACTIVITY ────────────────────────────
function trackLogin(req, userId, email, success) {
    loginActivity.push({
        userId,
        email,
        ip       : req.ip || req.headers["x-forwarded-for"] || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: new Date().toISOString(),
        success,
    });
}

// ─── HELPER: REVOKE ALL REFRESH TOKENS FOR A USER ────────────
function revokeUserRefreshTokens(userId) {
    refreshTokens = refreshTokens.filter(t => {
        try {
            const decoded = jwt.verify(t, JWT_REFRESH_SECRET);
            return decoded.id !== userId;
        } catch {
            return false;
        }
    });
}

// ─── MIDDLEWARE: VERIFY ACCESS TOKEN ─────────────────────────
function verifyToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).json({ message: "No token provided." });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token missing from Authorization header." });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token." });
    }
}

// ─── MIDDLEWARE: ROLE-BASED ACCESS CONTROL ───────────────────
function verifyRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ message: "Not authenticated." });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Access denied. Required role: [${roles.join(", ")}]. Your role: ${req.user.role}`,
            });
        }
        next();
    };
}

// ─── MIDDLEWARE: EMAIL MUST BE VERIFIED ──────────────────────
function requireVerified(req, res, next) {
    const user = users.find(u => u.id === req.user.id);
    if (!user || !user.isVerified) {
        return res.status(403).json({ message: "Please verify your email address first." });
    }
    next();
}


 //ROUTE 1 — REGISTER

app.post("/register", authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    if (users.find(u => u.email === email)) {
        return res.status(409).json({ message: "User already exists." });
    }

    const hashedPassword    = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const newUser = {
        id               : Date.now(),
        email,
        password         : hashedPassword,
        role             : "user",          // never trust req.body for role
        isVerified       : false,
        verificationToken,
        resetToken       : null,
        resetTokenExpiry : null,
    };

    const verifyLink = `${BASE_URL}/verify-email?token=${verificationToken}`;

    try {
        
        const previewUrl = await sendEmail(
            email,
            "Verify Your Email Address",
            `<p>Click the link below to verify your email:</p>
             <a href="${verifyLink}">${verifyLink}</a>
             <p>This link does not expire (demo only).</p>`
        );

        users.push(newUser);   // only save after email succeeds

        return res.status(201).json({
            message   : "Registered! Check your email (or the previewUrl below) to verify your account.",
            previewUrl,         // ← open this in your browser to see the email
            verifyLink,         // ← direct link for quick testing in Postman
        });

    } catch (err) {
        console.error("❌ Verification email failed:", err.message);
        return res.status(500).json({
            message: "Registration failed: could not send verification email. Please try again.",
        });
    }
});



//  ROUTE 3 — LOGIN
app.post("/login", authLimiter, async (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);

    if (!user) {
        trackLogin(req, null, email, false);
        return res.status(404).json({ message: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        trackLogin(req, user.id, email, false);
        return res.status(401).json({ message: "Invalid credentials." });
    }

    if (!user.isVerified) {
        trackLogin(req, user.id, email, false);
        return res.status(403).json({ message: "Please verify your email before logging in." });
    }

    const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
    );

    refreshTokens.push(refreshToken);
    trackLogin(req, user.id, email, true);

    res.json({ message: "Login successful", accessToken, refreshToken });
});

// =============================================================
//  ROUTE 4 — REFRESH TOKEN
// =============================================================
app.post("/refresh-token", (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) return res.status(401).json({ message: "Refresh token required." });
    if (!refreshTokens.includes(refreshToken)) {
        return res.status(403).json({ message: "Invalid refresh token." });
    }

    try {
        const decoded      = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        const newAccessToken = jwt.sign(
            { id: decoded.id, email: decoded.email, role: decoded.role },
            JWT_SECRET,
            { expiresIn: "15m" }
        );
        res.json({ accessToken: newAccessToken });
    } catch {
        return res.status(403).json({ message: "Refresh token expired or invalid. Please log in again." });
    }
});

//  ROUTE 5 — LOGOUT

app.post("/logout", (req, res) => {
    const { refreshToken } = req.body;
    const index = refreshTokens.indexOf(refreshToken);
    if (index !== -1) refreshTokens.splice(index, 1);
    res.json({ message: "Logged out successfully." });
});

//  ROUTE 6 — FORGOT PASSWORD

app.post("/forgot-password", authLimiter, async (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);

    // Same response whether email exists or not (prevents enumeration)
    if (!user) {
        return res.json({ message: "If that email exists, a reset link has been sent." });
    }

    const resetToken      = crypto.randomBytes(32).toString("hex");
    user.resetToken       = resetToken;
    user.resetTokenExpiry = Date.now() + 30 * 60 * 1000;  // 30 minutes

    const resetLink = `${BASE_URL}/reset-password?token=${resetToken}`;

    try {
        const previewUrl = await sendEmail(
            email,
            "Reset Your Password",
            `<h2>Password Reset Request</h2>
             <p>Click below to reset your password. Expires in 30 minutes.</p>
             <a href="${resetLink}">${resetLink}</a>
             <p>If you didn't request this, ignore this email.</p>`
        );

        return res.json({
            message   : "If that email exists, a reset link has been sent.",
            previewUrl,   // ← open in browser to see the reset email
            resetLink,    // ← direct link for quick testing
        });

    } catch (err) {
        console.error("❌ Reset email failed:", err.message);
        user.resetToken       = null;
        user.resetTokenExpiry = null;
        return res.status(500).json({ message: "Failed to send reset email. Please try again." });
    }
});


//  ROUTE 7 — RESET PASSWORD

app.post("/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required." });
    }

    const user = users.find(u => u.resetToken === token && u.resetTokenExpiry > Date.now());
    if (!user) {
        return res.status(400).json({ message: "Reset link is invalid or has expired." });
    }

    user.password         = await bcrypt.hash(newPassword, 10);
    user.resetToken       = null;
    user.resetTokenExpiry = null;

    revokeUserRefreshTokens(user.id);

    res.json({ message: "Password reset successfully. Please log in with your new password." });
});

//  ROUTE 8 — PROFILE  (any verified user)

app.get("/profile", verifyToken, requireVerified, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    res.json({
        message: "Profile accessed",
        user   : { id: user.id, email: user.email, role: user.role },
    });
});


//  ROUTE 9 — ADMIN DASHBOARD  (admin only)

app.get("/admin/dashboard", verifyToken, requireVerified, verifyRole("admin"), (req, res) => {
    res.json({
        message   : "Welcome to the admin dashboard",
        totalUsers: users.length,
        users     : users.map(u => ({
            id        : u.id,
            email     : u.email,
            role      : u.role,
            isVerified: u.isVerified,
        })),
    });
});


//  ROUTE 10 — LOGIN ACTIVITY  (admin only)

app.get("/admin/login-activity", verifyToken, requireVerified, verifyRole("admin"), (req, res) => {
    const limit    = parseInt(req.query.limit) || 50;
    const page     = parseInt(req.query.page)  || 1;
    const start    = (page - 1) * limit;
    const activity = [...loginActivity].reverse();

    res.json({
        total: loginActivity.length,
        page,
        limit,
        data : activity.slice(start, start + limit),
    });
});


//  ROUTE 11 — MY LOGIN HISTORY  (any authenticated user)

app.get("/my-activity", verifyToken, requireVerified, (req, res) => {
    const myActivity = loginActivity
        .filter(a => a.userId === req.user.id)
        .reverse()
        .slice(0, 20);
    res.json({ activity: myActivity });
});


//  START SERVER

app.listen(5000, () => {
    console.log("\n🚀 Server running on http://localhost:5000");
    console.log("\nAvailable Routes:");
    console.log("  POST   /register");
    console.log("  GET    /verify-email?token=...");
    console.log("  POST   /login");
    console.log("  POST   /refresh-token");
    console.log("  POST   /logout");
    console.log("  POST   /forgot-password");
    console.log("  POST   /reset-password");
    console.log("  GET    /profile               [auth required]");
    console.log("  GET    /admin/dashboard        [admin only]");
    console.log("  GET    /admin/login-activity   [admin only]");
    console.log("  GET    /my-activity            [auth required]");
    console.log("\n💡 TIP: After /register or /forgot-password, look for the");
    console.log("        ┌─────┐ box in terminal OR use previewUrl from the API response.\n");
});