const router = require('express').Router()
const User = require('../models/User')
const Club = require('../models/Club')
const Membership = require('../models/Membership')
const { auth, requireRole } = require('../middleware/auth')
const { httpError, wrap } = require('../utils/helpers')

router.use(auth)

// Lightweight directory (names/photos) used by the UI to show people
router.get('/directory', wrap(async (_req, res) => {
  res.json(await User.find().select('name email role club collegeId department year position photo phone'))
}))

// Super Admin sets (or replaces) a club's admin. Name/email/password are always
// supplied by the Super Admin — never auto-generated.
router.post('/club-admin', requireRole('superadmin'), wrap(async (req, res) => {
  const { clubName, name, email, password, department, phone } = req.body
  const club = await Club.findOne({ name: clubName })
  if (!club) throw httpError(404, 'Club not found.')
  if (!name?.trim()) throw httpError(400, 'Club Admin full name is required.')
  if (!password || password.length < 6) throw httpError(400, 'Password must contain at least 6 characters.')
  const taken = await User.findOne({ email: (email || '').toLowerCase() })
  if (taken && !(taken.role === 'clubadmin' && taken.club === club.name)) throw httpError(409, 'This email is already used by another account.')
  await User.deleteMany({ role: 'clubadmin', club: club.name })
  const admin = await User.create({ name, email, password, role: 'clubadmin', club: club.name, department, phone })
  res.status(201).json({ user: admin })
}))

// Club Admin grants Student Member access by institutional email — the grant
// elevates the student's existing account, so they keep their own credentials
// (password or Google) and simply land on the Student Member workspace.
router.post('/student-member', requireRole('clubadmin'), wrap(async (req, res) => {
  const { email, position, phone } = req.body
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) throw httpError(400, 'Student email is required.')
  const u = await User.findOne({ email: normalized })
  if (!u) throw httpError(404, 'No ClubConnect account found for this email. Ask the student to create their account (or sign in with Google) first, then grant access.')
  if (u.role === 'clubadmin' || u.role === 'superadmin') throw httpError(400, 'That email belongs to an admin account — it cannot be a Student Member.')
  if (u.role === 'studentmember' && u.club && u.club !== req.user.club) throw httpError(409, `${u.name} is already a Student Member of ${u.club}.`)
  u.role = 'studentmember'
  u.club = req.user.club
  u.position = (position || '').trim() || `Student Member / ${req.user.club} Coordinator`
  if (phone) u.phone = phone
  await u.save()
  const membership = await Membership.findOne({ user: u._id, club: req.user.club })
  if (membership) {
    membership.status = 'active'
    membership.role = u.position
    await membership.save()
  } else {
    await Membership.create({ user: u._id, club: req.user.club, status: 'active', role: u.position, year: '2026-27' })
  }
  res.json({ user: u })
}))

router.get('/student-members', requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const club = req.user.role === 'clubadmin' ? req.user.club : req.query.club
  res.json(await User.find({ role: 'studentmember', ...(club ? { club } : {}) }))
}))

// Revoking demotes the account back to a normal student — the account is never
// deleted, so the student keeps their login and can be granted access again.
router.delete('/student-member/:id', requireRole('clubadmin'), wrap(async (req, res) => {
  const key = req.params.id
  const m = /^[0-9a-f]{24}$/i.test(key)
    ? await User.findOne({ _id: key, role: 'studentmember', club: req.user.club })
    : await User.findOne({ email: key.toLowerCase(), role: 'studentmember', club: req.user.club })
  if (!m) throw httpError(404, 'Student member not found in your club.')
  m.role = 'student'
  m.club = undefined
  m.position = undefined
  await m.save()
  await Membership.deleteMany({ user: m._id, club: req.user.club })
  res.json({ message: 'Student Member access revoked — the account now signs in as a normal student.' })
}))

module.exports = router
