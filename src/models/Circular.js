const mongoose = require('mongoose')

const circularSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  club: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  date: String,
  time: String,
  venue: String,
  prizes: String,
  link: String,
  issuedOn: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true })
circularSchema.set('toJSON', { transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.__v; return r } })
module.exports = mongoose.model('Circular', circularSchema)
