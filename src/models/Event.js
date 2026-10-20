const mongoose = require('mongoose')

const eventSchema = new mongoose.Schema({
  club: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: String,
  category: String,
  date: { type: String, required: true, index: true },
  time: String,
  venue: String,
  capacity: Number,
  fee: { type: Number, default: 0 },
  participationType: { type: String, enum: ['individual', 'team'], default: 'individual' },
  organizerName: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completed: { type: Boolean, default: false },
  postponedReason: String
}, { timestamps: true })

// Live status: upcoming / ongoing / completed
eventSchema.virtual('status').get(function () {
  if (this.completed) return 'completed'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const d = new Date(this.date + 'T00:00:00').getTime()
  if (d === today) return 'ongoing'
  return d < today ? 'completed' : 'upcoming'
})
eventSchema.set('toJSON', { virtuals: true, transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.__v; return r } })
module.exports = mongoose.model('Event', eventSchema)
