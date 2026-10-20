const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const ROLES = ['student', 'studentmember', 'clubadmin', 'superadmin']

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: function () { return !this.googleId }, select: false },
  googleId: { type: String, index: true, sparse: true },
  role: { type: String, enum: ROLES, required: true, index: true },
  club: { type: String, index: true },
  collegeId: { type: String, trim: true },
  department: String,
  year: String,
  position: String,
  phone: String,
  bio: String,
  photo: String
}, { timestamps: true })

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})
userSchema.methods.matches = function (plain) { return bcrypt.compare(plain, this.password) }
userSchema.virtual('initials').get(function () {
  return (this.name || '').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()
})
userSchema.set('toJSON', { virtuals: true, transform: (_d, r) => { delete r.password; r.id = String(r._id); delete r._id; delete r.__v; return r } })

module.exports = mongoose.model('User', userSchema)
module.exports.ROLES = ROLES
