const mongoose = require('mongoose')

// One row per student per event, created only after the coordinator verifies the
// registered list against who was actually present (no QR involved).
const attendanceSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  markedAt: { type: Date, default: Date.now }
})
attendanceSchema.index({ event: 1, user: 1 }, { unique: true })
module.exports = mongoose.model('Attendance', attendanceSchema)
