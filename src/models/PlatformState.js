const mongoose = require('mongoose')

// Snapshot store used by the React app's sync mode (see README, "Sync mode").
const platformStateSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'main' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, minimize: false })
module.exports = mongoose.model('PlatformState', platformStateSchema)
