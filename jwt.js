const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());

//befault static middleware 
app.use(express.static("public")); 

// Fake database 
const users = [];


// Secret key 
const JWT_SECRET = "mysecretkey123";


// REGISTER USER
app.post("/register", async (req, res) => {
    const { email, password } = req.body;

    // check if user exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.json({ message: "User already exists" });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // save user
    users.push({
        id: Date.now(),
        email,
        password: hashedPassword
    });

    res.json({ message: "User registered successfully" });
});



// LOGIN USER

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) {
        return res.json({ message: "User not found" });
    } 

    // compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.json({ message: "Invalid credentials" });
    }

    // create JWT token
    const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "1h" }
    );

    res.json({
        message: "Login successful",
        token
    });
});




// MIDDLEWARE (AUTH CHECK)


function verifyToken(req, res, next) {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.json({ message: "Invalid token" });
    }
}


// PROTECTED ROUTE


app.get("/profile", verifyToken, (req, res) => {
    res.json({
        message: "Protected data accessed",
        user: req.user
    });
});



// START SERVER

app.listen(5000, () => {
    console.log("Server running on port 5000");
});