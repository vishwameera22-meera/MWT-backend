const mongoose = require('mongoose')

const weeklyReportSchema = new mongoose.Schema({
  club: { type: String, required: true, index: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  weekLabel: String,
  summary: { type: String, required: true },
  achievements: String,
  plans: String,
  events: [{ id: String, title: String, date: String, venue: String, registered: Number, attended: Number }],
  submittedTo: { type: String, enum: ['HOD', 'Super Admin'], default: 'HOD' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['submitted', 'verified', 'rejected'], default: 'submitted' },
  remarks: String,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date
}, { timestamps: true })
weeklyReportSchema.set('toJSON', { transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.__v; return r } })
module.exports = mongoose.model('WeeklyReport', weeklyReportSchema)
