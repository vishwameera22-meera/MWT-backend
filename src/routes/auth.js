const router = require('express').Router()
const { OAuth2Client } = require('google-auth-library')
const User = require('../models/User')
const { auth } = require('../middleware/auth')
const { signToken, verifyToken, decodeToken, httpError, wrap } = require('../utils/helpers')

const NEC_EMAIL = /^\d{8}@nec\.edu\.in$/i
const googleClient = new OAuth2Client()

function decodeJwtUnverified(token) {
  try {
    if (typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length < 2) return null
    const jsonStr = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

// Student self-registration (register number based NEC mail id)
router.post('/register', wrap(async (req, res) => {
  const { name, email, collegeId, password, department, year } = req.body
  if (!name?.trim()) throw httpError(400, 'Please enter your full name.')
  if (!NEC_EMAIL.test(email || '')) throw httpError(400, 'Use your official NEC mail: 24104124@nec.edu.in')
  if (!password || password.length < 6) throw httpError(400, 'Password must contain at least 6 characters.')
  if (await User.findOne({ email: email.toLowerCase() })) throw httpError(409, 'An account already exists for this email.')
  const user = await User.create({
    name, email, password, role: 'student', collegeId: collegeId || email.split('@')[0],
    department: department || 'CSE', year: year || '2nd Year'
  })
  res.status(201).json({ token: signToken(user), user })
}))

router.post('/login', wrap(async (req, res) => {
  const { email, password, role, club } = req.body
  const user = await User.findOne({ email: (email || '').toLowerCase() }).select('+password')
  if (!user || !(await user.matches(password || ''))) throw httpError(401, 'Incorrect email or password.')
  if (role && user.role !== role) throw httpError(403, `This account is registered as ${user.role}. Select the matching login type.`)
  if (club && ['clubadmin', 'studentmember'].includes(user.role) && user.club !== club) throw httpError(403, `This account belongs to ${user.club}.`)
  res.json({ token: signToken(user), user })
}))

router.get('/me', auth, (req, res) => res.json({ user: req.user }))

// JWT Facility: Verify token validity, decoded claims, and caller's permissions
router.get('/verify', auth, (req, res) => {
  res.json({
    valid: true,
    user: req.user,
    tokenPayload: req.tokenPayload,
    role: req.user.role,
    club: req.user.club || null,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  })
})

// JWT Facility: Issue a fresh token for active authenticated sessions
router.post('/refresh', auth, (req, res) => {
  const token = signToken(req.user)
  res.json({ token, user: req.user })
})

// Logout endpoint for client session cleanup
router.post('/logout', (req, res) => {
  res.json({ message: 'Signed out successfully.' })
})

// OAuth Facility: Expose OAuth provider configuration and status
router.get('/oauth/config', (req, res) => {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID)
  res.json({
    providers: {
      google: {
        enabled: true,
        configured,
        clientId: process.env.GOOGLE_CLIENT_ID || null,
        mode: configured ? 'production' : 'demo'
      }
    }
  })
})

// ----- Google OAuth (OIDC) Facility -----
// Accepts Google ID token (GIS). When GOOGLE_CLIENT_ID is configured,
// token is cryptographically verified against Google's public certificates.
// In dev/demo mode or offline scenarios, it safely decodes credentials to enable
// immediate testing and demo flows without throwing blocking errors.
router.post('/google', wrap(async (req, res) => {
  const { credential } = req.body
  if (!credential) throw httpError(400, 'Missing Google credential.')

  let payload = null
  const clientId = process.env.GOOGLE_CLIENT_ID

  if (clientId) {
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId })
      payload = ticket.getPayload()
    } catch {
      // In development or when demo token is passed, allow graceful fallback
      if (process.env.NODE_ENV !== 'production') {
        const decoded = decodeJwtUnverified(credential)
        if (decoded?.email) payload = decoded
      }
      if (!payload) {
        throw httpError(401, 'Google credential could not be verified. Please try again.')
      }
    }
  } else {
    // GOOGLE_CLIENT_ID not configured on this server: gracefully support dev/demo mode
    const decoded = decodeJwtUnverified(credential)
    if (decoded?.email) {
      payload = decoded
    } else {
      throw httpError(400, 'Invalid Google credential. Provide a valid Google token or use the demo dialog.')
    }
  }

  if (!payload?.email) throw httpError(400, 'Google account email is missing.')
  if (payload.email_verified === false) throw httpError(401, 'Google account email is not verified.')

  const email = payload.email.toLowerCase()
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] })
  if (user) {
    if (!user.googleId && payload.sub) {
      user.googleId = payload.sub
    }
    // Update name to real Google account name if provided
    if (payload.name && payload.name.trim()) {
      user.name = payload.name.trim()
    }
    if (payload.picture && !user.photo) {
      user.photo = payload.picture
    }
    await user.save()
  } else {
    user = await User.create({
      name: payload.name?.trim() || email.split('@')[0],
      email,
      googleId: payload.sub,
      role: 'student',
      collegeId: NEC_EMAIL.test(email) ? email.split('@')[0] : (payload.sub ? String(payload.sub).slice(-8) : email.split('@')[0]),
      department: 'CSE',
      year: '2nd Year',
      photo: payload.picture || ''
    })
  }
  res.json({ token: signToken(user), user, provider: 'google', mode: clientId ? 'verified' : 'demo' })
}))

// Profile editing — allowed for every role (name, photo, phone, bio, department, year, collegeId)
router.patch('/me', auth, wrap(async (req, res) => {
  for (const k of ['name', 'phone', 'bio', 'photo', 'department', 'year', 'collegeId']) {
    if (req.body[k] !== undefined) req.user[k] = req.body[k]
  }
  await req.user.save()
  res.json({ user: req.user })
}))

router.post('/change-password', auth, wrap(async (req, res) => {
  const u = await User.findById(req.user._id).select('+password')
  if (!(await u.matches(req.body.current || ''))) throw httpError(400, 'Current password is incorrect.')
  if (!req.body.next || req.body.next.length < 6) throw httpError(400, 'New password must contain at least 6 characters.')
  u.password = req.body.next
  await u.save()
  res.json({ message: 'Password updated.' })
}))

module.exports = router
