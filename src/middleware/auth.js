const jwt = require('jsonwebtoken')
const User = require('../models/User')

async function auth(req, res, next) {
  try {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!token) return res.status(401).json({ message: 'Login required.' })
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.id)
    if (!user) return res.status(401).json({ message: 'Account no longer exists.', code: 'USER_NOT_FOUND' })
    req.user = user
    req.tokenPayload = payload
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please sign in again.', code: 'TOKEN_EXPIRED' })
    }
    res.status(401).json({ message: 'Invalid authentication token. Please sign in again.', code: 'INVALID_TOKEN' })
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action.' })

// A club admin / student member may only touch their own club's data.
const sameClubOrSuper = (req, clubName) => req.user.role === 'superadmin' || req.user.club === clubName

module.exports = { auth, requireRole, sameClubOrSuper }
