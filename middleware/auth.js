const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'elv-coord-secret-2024-xK9mP';

function verifyToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireSalesOrAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'sales') {
    return res.status(403).json({ error: 'Access restricted to sales or admin users' });
  }
  next();
}

module.exports = { verifyToken, requireAdmin, requireSalesOrAdmin, JWT_SECRET };
