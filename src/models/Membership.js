const mongoose = require('mongoose')

const membershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  club: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending', 'approved_pending_payment', 'active', 'rejected'], default: 'pending' },
  role: { type: String, default: 'Member' },
  year: String,
  paid: { type: Boolean, default: false },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })
membershipSchema.index({ user: 1, club: 1 }, { unique: true })
module.exports = mongoose.model('Membership', membershipSchema)
