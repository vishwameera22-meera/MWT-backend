const mongoose = require('mongoose')

module.exports = async function connectDB() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set. Copy .env.example to .env and set it.')
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  console.log(`✓ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`)
}
