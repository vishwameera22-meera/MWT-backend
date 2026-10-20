const jwt = require('jsonwebtoken')
const Notification = require('../models/Notification')

exports.signToken = (user) => jwt.sign(
  {
    id: user._id,
    role: user.role,
    email: user.email,
    club: user.club || null
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
)
exports.verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET)
exports.decodeToken = (token) => jwt.decode(token)
exports.httpError = (status, message) => Object.assign(new Error(message), { status })
exports.wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
exports.notify = (userIds, payload) =>
  Notification.insertMany([...new Set(userIds.map(String))].map(user => ({ user, ...payload })))
