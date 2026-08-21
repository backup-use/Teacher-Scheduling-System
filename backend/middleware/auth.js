const jwt = require('jsonwebtoken');

// 1. Verify if user is Logged In
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <TOKEN>"

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Naglalaman ng { id, role, email }
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid or expired token." });
    }
}

// 2. Verify if user is an ADMIN (Strict access)
function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: "Access forbidden: Admins only." });
    }
}

// 3. Verify if user is a TEACHER
function requireTeacher(req, res, next) {
    if (req.user && req.user.role === 'teacher') {
        next();
    } else {
        return res.status(403).json({ error: "Access forbidden: Teachers only." });
    }
}

module.exports = { verifyToken, requireAdmin, requireTeacher };