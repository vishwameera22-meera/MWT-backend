const mongoose = require('mongoose')

const registrationSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teamName: String,
  teamMembers: [String],
  paid: { type: Boolean, default: false }
}, { timestamps: true })
registrationSchema.index({ event: 1, user: 1 }, { unique: true })
module.exports = mongoose.model('Registration', registrationSchema)
