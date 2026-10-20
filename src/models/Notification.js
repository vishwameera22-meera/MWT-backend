const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: String,
  message: String,
  type: { type: String, default: 'event' },
  link: String,
  read: { type: Boolean, default: false }
}, { timestamps: true })
notificationSchema.set('toJSON', { transform: (_d, r) => { r.id = String(r._id); delete r._id; delete r.__v; return r } })
module.exports = mongoose.model('Notification', notificationSchema)
