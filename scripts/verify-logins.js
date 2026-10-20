// Verifies the five institutional bootstrap logins end-to-end against the real
// Express login route (bcrypt compare + role/club gate + JWT issuance + /auth/me).
// Runs without MongoDB: the User model is stubbed in the require cache, but the
// login route, the JWT pipeline and bcrypt itself are the production code paths.
//   npm run verify:logins
const path = require('path')
const assert = require('assert')
const http = require('http')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-logins-secret'

const BACKEND = path.join(__dirname, '..')
const appPath = path.join(BACKEND, 'src', 'app.js')
const userModelPath = path.join(BACKEND, 'src', 'models', 'User.js')

const accounts = require('../src/bootstrapAccounts')

function request(app, method, url, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address()
      const data = body ? JSON.stringify(body) : null
      const headers = {}
      if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data) }
      if (token) headers.Authorization = `Bearer ${token}`
      const req = http.request({ host: '127.0.0.1', port, method, path: url, headers }, res => {
        let out = ''
        res.on('data', c => { out += c })
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }) })
      })
      req.on('error', e => { server.close(); reject(e) })
      if (data) req.write(data)
      req.end()
    })
  })
}

async function main() {
  console.log(`Verifying ${accounts.length} bootstrap logins against the production login route…\n`)

  // Real model => real schema, real matches(), real toJSON. Passwords hashed with
  // the same bcrypt rounds (10) the model's pre-save hook uses.
  const UserReal = require(userModelPath)
  const docs = {}
  for (const a of accounts) {
    docs[a.email.toLowerCase()] = new UserReal({
      name: a.name, email: a.email.toLowerCase(), password: await bcrypt.hash(a.password, 10),
      role: a.role, club: a.club, collegeId: a.collegeId, department: a.department, year: a.year, position: a.position
    })
  }

  // Swap in stubbed persistence before the app first loads the model.
  require.cache[userModelPath].exports = {
    findOne: (q = {}) => ({ select: async () => docs[q.email] || null }),
    findById: async (id) => Object.values(docs).find(d => String(d._id) === String(id)) || null
  }
  const app = require(appPath)

  const rolesSeen = new Set()
  let pass = 0

  for (const a of accounts) {
    const label = `${a.role.padEnd(12)} ${a.email}`
    const club = a.club || null

    const r = await request(app, 'POST', '/api/auth/login', { body: { email: a.email, password: a.password, role: a.role, club } })
    assert.strictEqual(r.status, 200, `${label}: expected 200, got ${r.status} ${JSON.stringify(r.body)}`)
    assert.ok(r.body.token, `${label}: no JWT returned`)
    assert.strictEqual(r.body.user.role, a.role, `${label}: role mismatch`)
    assert.ok(!('password' in r.body.user), `${label}: password leaked in response`)
    if (a.club) assert.strictEqual(r.body.user.club, a.club, `${label}: club mismatch`)

    const payload = jwt.verify(r.body.token, process.env.JWT_SECRET)
    assert.strictEqual(payload.role, a.role, `${label}: JWT role mismatch`)
    assert.strictEqual(String(payload.id), String(docs[a.email.toLowerCase()]._id), `${label}: JWT subject mismatch`)

    const me = await request(app, 'GET', '/api/auth/me', { token: r.body.token })
    assert.strictEqual(me.status, 200, `${label}: /auth/me failed`)
    assert.strictEqual(me.body.user.email.toLowerCase(), a.email.toLowerCase(), `${label}: /auth/me returned another account`)

    rolesSeen.add(a.role)
    pass++
    console.log(`  ✓ ${label.padEnd(46)} signs in → ${a.role} · JWT ok · /auth/me ok`)
  }

  for (const role of ['superadmin', 'clubadmin', 'studentmember', 'student']) {
    assert.ok(rolesSeen.has(role), `no bootstrap login covers role "${role}"`)
  }
  console.log('\n  ✓ all four roles covered by the five logins')

  // -------- negative checks: wrong password / role / club --------
  const bad = await request(app, 'POST', '/api/auth/login', { body: { email: accounts[1].email, password: 'wrong-password' } })
  assert.strictEqual(bad.status, 401, 'wrong password must be rejected')
  console.log('  ✓ wrong password → 401')

  const wrongRole = await request(app, 'POST', '/api/auth/login', { body: { email: accounts[1].email, password: accounts[1].password, role: 'student' } })
  assert.strictEqual(wrongRole.status, 403, 'role mismatch must be rejected')
  console.log('  ✓ logging in as the wrong role → 403')

  const wrongClub = await request(app, 'POST', '/api/auth/login', { body: { email: accounts[1].email, password: accounts[1].password, role: 'clubadmin', club: 'CSI' } })
  assert.strictEqual(wrongClub.status, 403, 'cross-club login must be rejected')
  console.log('  ✓ Club Admin picking another club → 403')

  const noAuth = await request(app, 'GET', '/api/auth/me', {})
  assert.strictEqual(noAuth.status, 401, 'missing token must be rejected')
  console.log('  ✓ /auth/me without token → 401')

  console.log(`\nALL ${pass + 8} LOGIN CHECKS PASSED — ${pass} accounts signed in, JWT + role + club scope verified`)
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })
