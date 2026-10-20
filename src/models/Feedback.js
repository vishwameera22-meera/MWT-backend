const mongoose = require('mongoose')

const feedbackSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  club: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: String
}, { timestamps: true })
feedbackSchema.index({ event: 1, user: 1 }, { unique: true })
module.exports = mongoose.model('Feedback', feedbackSchema)
