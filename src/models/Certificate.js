const mongoose = require('mongoose')
const crypto = require('crypto')

const certificateSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  club: String,
  title: String,
  verifyCode: { type: String, unique: true, default: () => crypto.randomBytes(6).toString('hex').toUpperCase() },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })
certificateSchema.index({ event: 1, user: 1 }, { unique: true })
certificateSchema.set('toJSON', { transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.__v; return r } })
module.exports = mongoose.model('Certificate', certificateSchema)
