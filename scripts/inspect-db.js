require('dotenv').config()
const mongoose = require('mongoose')
const connectDB = require('../src/config/db')
const User = require('../src/models/User')
const Club = require('../src/models/Club')

async function run() {
  console.log('Connecting to MongoDB Atlas...')
  await connectDB()
  
  const db = mongoose.connection.db
  console.log(`\n========================================`)
  console.log(` DATABASE: ${mongoose.connection.name}`)
  console.log(` HOST:     ${mongoose.connection.host}`)
  console.log(`========================================\n`)

  const collections = await db.listCollections().toArray()
  console.log(`Found ${collections.length} collections:`)
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments()
    console.log(`  • ${c.name.padEnd(20)}: ${count} documents`)
  }

  console.log(`\n--- USERS in Database ---`)
  const users = await User.find({}).select('name email role club collegeId')
  users.forEach((u, i) => {
    console.log(`  ${i + 1}. [${u.role.toUpperCase()}] ${u.name} (${u.email}) - Club: ${u.club || 'N/A'}`)
  })

  console.log(`\n--- CLUBS in Database ---`)
  const clubs = await Club.find({}).select('name code')
  clubs.forEach((cl, i) => {
    console.log(`  ${i + 1}. ${cl.name} (${cl.code})`)
  })

  // Check appstate if any
  const appStateCol = db.collection('appstates')
  const appStateCount = await appStateCol.countDocuments()
  if (appStateCount > 0) {
    console.log(`\n--- APP STATE ---`)
    const stateDoc = await appStateCol.findOne({})
    if (stateDoc) {
      console.log(`  State version / last modified: ${stateDoc.updatedAt || 'N/A'}`)
      if (stateDoc.events) console.log(`  Events count: ${stateDoc.events.length}`)
      if (stateDoc.members) console.log(`  Members count: ${stateDoc.members.length}`)
    }
  }

  console.log(`\n========================================\n`)
  await mongoose.disconnect()
  process.exit(0)
}

run().catch(err => {
  console.error('Error connecting to MongoDB:', err.message)
  process.exit(1)
})
