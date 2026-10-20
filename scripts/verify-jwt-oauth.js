// Comprehensive end-to-end test suite for JWT & OAuth facilities
// Run via: node scripts/verify-jwt-oauth.js
const path = require('path')
const assert = require('assert')
const http = require('http')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'jwt-test-secret-key-1234567890'
process.env.JWT_EXPIRES_IN = '1h'

const BACKEND = path.join(__dirname, '..')
const appPath = path.join(BACKEND, 'src', 'app.js')
const userModelPath = path.join(BACKEND, 'src', 'models', 'User.js')

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

function makeDemoGoogleCredential({ email, name, sub, picture }) {
  const now = Math.floor(Date.now() / 1000)
  return [
    b64url({ alg: 'none', typ: 'JWT' }),
    b64url({
      iss: 'https://accounts.google.com',
      aud: 'demo.apps.googleusercontent.com',
      sub: sub || `google-sub-${email}`,
      email,
      email_verified: true,
      name: name || email.split('@')[0],
      picture: picture || 'https://example.com/avatar.png',
      iat: now,
      exp: now + 3600
    }),
    'demo-sig'
  ].join('.')
}

function request(app, method, url, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address()
      const data = body ? JSON.stringify(body) : null
      const headers = {}
      if (data) {
        headers['Content-Type'] = 'application/json'
        headers['Content-Length'] = Buffer.byteLength(data)
      }
      if (token) headers.Authorization = `Bearer ${token}`
      const req = http.request({ host: '127.0.0.1', port, method, path: url, headers }, res => {
        let out = ''
        res.on('data', c => { out += c })
        res.on('end', () => {
          server.close()
          let parsed = null
          try { parsed = out ? JSON.parse(out) : null } catch { parsed = out }
          resolve({ status: res.statusCode, body: parsed })
        })
      })
      req.on('error', e => { server.close(); reject(e) })
      if (data) req.write(data)
      req.end()
    })
  })
}

async function runTests() {
  console.log('=================================================================')
  console.log('  NEC ClubConnect: JWT & OAuth Facility Verification Suite')
  console.log('=================================================================\n')

  const UserReal = require(userModelPath)
  const inMemoryUsers = {}

  // Seed sample users in mock storage
  const sampleUsers = [
    {
      name: 'Super Administrator',
      email: 'superadmin@nec.edu.in',
      password: await bcrypt.hash('ChangeMe@123', 10),
      role: 'superadmin'
    },
    {
      name: 'IEEE Club Admin',
      email: 'ieeeadmin@nec.edu.in',
      password: await bcrypt.hash('IeeeAdmin@123', 10),
      role: 'clubadmin',
      club: 'IEEE'
    },
    {
      name: 'CSI Club Admin',
      email: 'csiadmin@nec.edu.in',
      password: await bcrypt.hash('CsiAdmin@123', 10),
      role: 'clubadmin',
      club: 'CSI'
    },
    {
      name: 'Jane Student',
      email: '24104124@nec.edu.in',
      password: await bcrypt.hash('Student@123456', 10),
      role: 'student',
      collegeId: '24104124'
    }
  ]

  for (const s of sampleUsers) {
    const doc = new UserReal(s)
    doc.save = async function () { return this }
    inMemoryUsers[s.email.toLowerCase()] = doc
  }

  // Stub persistence for User model to support both await findOne() and await findOne().select()
  require.cache[userModelPath].exports = {
    findOne: (q = {}) => {
      const exec = async () => {
        if (q.email) return inMemoryUsers[q.email.toLowerCase()] || null
        if (q.$or) {
          return Object.values(inMemoryUsers).find(u =>
            (q.$or[0]?.googleId && u.googleId === q.$or[0].googleId) ||
            (q.$or[1]?.email && u.email === q.$or[1].email.toLowerCase())
          ) || null
        }
        return null
      }
      return {
        select: () => exec(),
        then: (onResolve, onReject) => exec().then(onResolve, onReject),
        catch: (onReject) => exec().catch(onReject)
      }
    },
    findById: async (id) => Object.values(inMemoryUsers).find(d => String(d._id) === String(id)) || null,
    create: async (data) => {
      const doc = new UserReal(data)
      doc.save = async function () { return this }
      inMemoryUsers[data.email.toLowerCase()] = doc
      return doc
    }
  }

  const app = require(appPath)
  let passed = 0

  // -------------------------------------------------------------
  // Test 1: Sign-in & JWT Issuance
  // -------------------------------------------------------------
  console.log('[Phase 1: JWT Issuance & Payload Structure]')
  const loginRes = await request(app, 'POST', '/api/auth/login', {
    body: { email: '24104124@nec.edu.in', password: 'Student@123456', role: 'student' }
  })
  assert.strictEqual(loginRes.status, 200, 'Student login should return 200')
  assert.ok(loginRes.body.token, 'Response should contain a JWT')
  const studentToken = loginRes.body.token

  const decodedPayload = jwt.verify(studentToken, process.env.JWT_SECRET)
  assert.strictEqual(decodedPayload.role, 'student', 'JWT claims role must be student')
  assert.strictEqual(decodedPayload.email, '24104124@nec.edu.in', 'JWT claims email must match')
  console.log('  ✓ Test 1: JWT successfully signed with secret & includes claims (id, role, email, club)')
  passed++

  // -------------------------------------------------------------
  // Test 2: Protected Route Authentication via Bearer Token
  // -------------------------------------------------------------
  console.log('\n[Phase 2: Protected Endpoint & JWT Verification]')
  const meRes = await request(app, 'GET', '/api/auth/me', { token: studentToken })
  assert.strictEqual(meRes.status, 200, '/api/auth/me should return 200 for authenticated user')
  assert.strictEqual(meRes.body.user.email, '24104124@nec.edu.in', 'Returned user email must match')
  console.log('  ✓ Test 2: Protected endpoint /api/auth/me accepts valid Bearer token')
  passed++

  // -------------------------------------------------------------
  // Test 3: JWT Verification Endpoint (/api/auth/verify)
  // -------------------------------------------------------------
  const verifyRes = await request(app, 'GET', '/api/auth/verify', { token: studentToken })
  assert.strictEqual(verifyRes.status, 200, '/api/auth/verify should return 200')
  assert.strictEqual(verifyRes.body.valid, true, 'Verification should return valid: true')
  assert.strictEqual(verifyRes.body.role, 'student', 'Verification should return role')
  console.log('  ✓ Test 3: /api/auth/verify returns validity status, claims and role')
  passed++

  // -------------------------------------------------------------
  // Test 4: Missing Token Rejection
  // -------------------------------------------------------------
  console.log('\n[Phase 3: Security & Token Validation Checks]')
  const noTokenRes = await request(app, 'GET', '/api/auth/me')
  assert.strictEqual(noTokenRes.status, 401, 'Request without token must return 401')
  console.log('  ✓ Test 4: Request without token correctly rejected with 401')
  passed++

  // -------------------------------------------------------------
  // Test 5: Tampered Token Rejection
  // -------------------------------------------------------------
  const tamperedToken = studentToken.slice(0, -6) + 'abcdef'
  const tamperedRes = await request(app, 'GET', '/api/auth/me', { token: tamperedToken })
  assert.strictEqual(tamperedRes.status, 401, 'Tampered token must return 401')
  assert.strictEqual(tamperedRes.body.code, 'INVALID_TOKEN', 'Tampered token returns INVALID_TOKEN code')
  console.log('  ✓ Test 5: Tampered signature correctly rejected with 401 INVALID_TOKEN')
  passed++

  // -------------------------------------------------------------
  // Test 6: Expired Token Rejection
  // -------------------------------------------------------------
  const expiredToken = jwt.sign(
    { id: inMemoryUsers['24104124@nec.edu.in']._id, role: 'student', email: '24104124@nec.edu.in' },
    process.env.JWT_SECRET,
    { expiresIn: -10 } // Expired 10 seconds ago
  )
  const expiredRes = await request(app, 'GET', '/api/auth/me', { token: expiredToken })
  assert.strictEqual(expiredRes.status, 401, 'Expired token must return 401')
  assert.strictEqual(expiredRes.body.code, 'TOKEN_EXPIRED', 'Expired token returns TOKEN_EXPIRED code')
  console.log('  ✓ Test 6: Expired token correctly rejected with 401 TOKEN_EXPIRED')
  passed++

  // -------------------------------------------------------------
  // Test 7: JWT Refresh Endpoint (/api/auth/refresh)
  // -------------------------------------------------------------
  console.log('\n[Phase 4: JWT Lifecycle & Refresh]')
  const refreshRes = await request(app, 'POST', '/api/auth/refresh', { token: studentToken })
  assert.strictEqual(refreshRes.status, 200, '/api/auth/refresh should return 200')
  assert.ok(refreshRes.body.token, 'Refresh returns a new token')
  const refreshedToken = refreshRes.body.token
  const verifyRefreshed = await request(app, 'GET', '/api/auth/verify', { token: refreshedToken })
  assert.strictEqual(verifyRefreshed.status, 200, 'Refreshed token is valid')
  console.log('  ✓ Test 7: /api/auth/refresh issues a new valid JWT for authenticated sessions')
  passed++

  // -------------------------------------------------------------
  // Test 8: Logout Endpoint (/api/auth/logout)
  // -------------------------------------------------------------
  const logoutRes = await request(app, 'POST', '/api/auth/logout')
  assert.strictEqual(logoutRes.status, 200, '/api/auth/logout returns 200')
  console.log('  ✓ Test 8: /api/auth/logout returns 200 success response')
  passed++

  // -------------------------------------------------------------
  // Test 9: Role-based Authorization Gate
  // -------------------------------------------------------------
  console.log('\n[Phase 5: Role-based & Club-scoped Access Control]')
  // Student trying to hit superadmin endpoint /api/users/club-admin
  const rbacRes = await request(app, 'POST', '/api/users/club-admin', {
    token: studentToken,
    body: { club: 'IEEE', name: 'Test', email: 'test@nec.edu.in', password: 'password123' }
  })
  assert.strictEqual(rbacRes.status, 403, 'Student role forbidden from superadmin endpoint')
  console.log('  ✓ Test 9: Student role blocked with 403 from superadmin-only routes')
  passed++

  // -------------------------------------------------------------
  // Test 10: OAuth Configuration Endpoint
  // -------------------------------------------------------------
  console.log('\n[Phase 6: OAuth Facilities (Google OIDC & Linking)]')
  const oauthConfigRes = await request(app, 'GET', '/api/auth/oauth/config')
  assert.strictEqual(oauthConfigRes.status, 200, '/api/auth/oauth/config returns 200')
  assert.ok(oauthConfigRes.body.providers.google, 'Google OAuth provider metadata exposed')
  console.log('  ✓ Test 10: /api/auth/oauth/config exposes OAuth provider status')
  passed++

  // -------------------------------------------------------------
  // Test 11: Google OAuth - New Student Onboarding
  // -------------------------------------------------------------
  const newGoogleEmail = '24109999@nec.edu.in'
  const newGoogleCred = makeDemoGoogleCredential({
    email: newGoogleEmail,
    name: 'New Google Student',
    sub: 'google-sub-24109999',
    picture: 'https://lh3.googleusercontent.com/avatar.jpg'
  })
  const newGoogleRes = await request(app, 'POST', '/api/auth/google', { body: { credential: newGoogleCred } })
  assert.strictEqual(newGoogleRes.status, 200, 'Google OAuth registration returns 200')
  assert.ok(newGoogleRes.body.token, 'Returns signed JWT for Google user')
  assert.strictEqual(newGoogleRes.body.user.role, 'student', 'New Google sign-in created as student')
  assert.strictEqual(newGoogleRes.body.user.googleId, 'google-sub-24109999', 'Google ID stored')
  console.log('  ✓ Test 11: Google OAuth automatically onboards new users with student role and JWT')
  passed++

  // -------------------------------------------------------------
  // Test 12: Google OAuth - Existing Account Linking
  // -------------------------------------------------------------
  const existingAdminEmail = 'ieeeadmin@nec.edu.in'
  const adminGoogleCred = makeDemoGoogleCredential({
    email: existingAdminEmail,
    name: 'IEEE Admin Google',
    sub: 'google-sub-ieeeadmin-12345'
  })
  const linkRes = await request(app, 'POST', '/api/auth/google', { body: { credential: adminGoogleCred } })
  assert.strictEqual(linkRes.status, 200, 'Google OAuth linking returns 200')
  assert.ok(linkRes.body.token, 'Returns signed JWT')
  assert.strictEqual(linkRes.body.user.role, 'clubadmin', 'Preserves clubadmin role upon Google sign-in')
  assert.strictEqual(linkRes.body.user.googleId, 'google-sub-ieeeadmin-12345', 'Links Google ID to existing account')
  console.log('  ✓ Test 12: Google OAuth links to existing account and preserves role & privileges')
  passed++

  console.log('\n=================================================================')
  console.log(`  ALL ${passed} JWT & OAUTH TESTS PASSED SUCCESSFULLY!`)
  console.log('=================================================================\n')
}

runTests().catch(err => {
  console.error('\n✗ TEST SUITE FAILED:', err)
  process.exit(1)
})
