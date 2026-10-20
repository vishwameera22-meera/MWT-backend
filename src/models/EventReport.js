const mongoose = require('mongoose')

const eventReportSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  club: { type: String, required: true, index: true },
  eventTitle: String,
  venue: String,
  date: String,
  paragraphs: [String],
  photos: [{ src: String, caption: String }],
  registered: Number,
  attended: Number,
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
  submittedAt: Date,
  // Only these students may open the report (registered / attended participants)
  sentTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true })
eventReportSchema.set('toJSON', { transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.__v; return r } })
module.exports = mongoose.model('EventReport', eventReportSchema)
