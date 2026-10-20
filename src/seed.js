// Creates the 6 official clubs and the five institutional bootstrap logins
// (Super Admin, two Club Admins, one Student Member, one Student). Safe to run
// repeatedly — existing accounts are left untouched.
require('dotenv').config()
const mongoose = require('mongoose')
const connectDB = require('./config/db')
const Club = require('./models/Club')
const User = require('./models/User')
const bootstrapAccounts = require('./bootstrapAccounts')

const CLUBS = [
  { slug: 'ieee', name: 'IEEE', code: 'IEEE-NEC', fullName: 'Institute of Electrical and Electronics Engineers – NEC Student Branch', domain: 'Electronics, Computing & Emerging Tech', accent: '#00629B', accent2: '#00A3E0' },
  { slug: 'csi', name: 'CSI', code: 'CSI-NEC', fullName: 'Computer Society of India – NEC Student Chapter', domain: 'Computer Science & IT', accent: '#7C3AED', accent2: '#EC4899' },
  { slug: 'iste', name: 'ISTE', code: 'ISTE-NEC', fullName: 'Indian Society for Technical Education – NEC Chapter', domain: 'Technical Education & Skills', accent: '#059669', accent2: '#10B981' },
  { slug: 'iei', name: 'IE(I)', code: 'IEI-NEC', fullName: 'The Institution of Engineers (India) – NEC Student Chapter', domain: 'Core Engineering', accent: '#B45309', accent2: '#F59E0B' },
  { slug: 'it', name: 'IT', code: 'IT-NEC', fullName: 'Information Technology Association', domain: 'Information Technology', accent: '#2563EB', accent2: '#06B6D4' },
  { slug: 'cse_assoc', name: 'CSE Association', code: 'CSEA-NEC', fullName: 'Computer Science & Engineering Association', domain: 'Computer Science, Software & Emerging Tech', accent: '#4285F4', accent2: '#EA4335' }
]

;(async () => {
  await connectDB()
  for (const c of CLUBS) {
    await Club.updateOne({ slug: c.slug }, { $setOnInsert: { ...c, category: 'Technical', fee: 200, established: 2026 } }, { upsert: true })
  }
  console.log(`✓ ${CLUBS.length} clubs ready`)

  for (const a of bootstrapAccounts) {
    const email = a.email.toLowerCase()
    if (await User.findOne({ email })) {
      console.log(`• ${a.role.padEnd(12)} already exists: ${email}`)
      continue
    }
    await User.create({
      name: a.name, email, password: a.password, role: a.role, club: a.club,
      collegeId: a.collegeId, department: a.department, year: a.year, position: a.position
    })
    console.log(`✓ ${a.role.padEnd(12)} created: ${email}  — ${a.summary}`)
  }
  console.log('\nChange every bootstrap password after the first sign-in (Profile → Change password).')
  await mongoose.disconnect()
})().catch(e => { console.error(e); process.exit(1) })
