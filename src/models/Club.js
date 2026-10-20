const mongoose = require('mongoose')

const clubSchema = new mongoose.Schema({
  slug: { type: String, unique: true, required: true },
  name: { type: String, required: true, unique: true },
  code: String,
  fullName: String,
  category: { type: String, default: 'Technical' },
  domain: String,
  tagline: String,
  description: String,
  vision: String,
  mission: String,
  fee: { type: Number, default: 0 },
  established: Number,
  accent: String,
  accent2: String,
  logo: String
}, { timestamps: true })

clubSchema.set('toJSON', { transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.__v; return r } })
module.exports = mongoose.model('Club', clubSchema)
