const router = require('express').Router()
const Notification = require('../models/Notification')
const Certificate = require('../models/Certificate')
const Attendance = require('../models/Attendance')
const Event = require('../models/Event')
const PlatformState = require('../models/PlatformState')
const { auth, requireRole, sameClubOrSuper } = require('../middleware/auth')
const { httpError, wrap, notify } = require('../utils/helpers')


// ----- Notifications -----
router.get('/notifications', auth, wrap(async (req, res) => res.json(await Notification.find({ user: req.user._id }).sort('-createdAt').limit(50))))
router.patch('/notifications/read-all', auth, wrap(async (req, res) => { await Notification.updateMany({ user: req.user._id, read: false }, { read: true }); res.json({ message: 'ok' }) }))

// ----- Certificates: only for students whose attendance was verified -----
router.post('/certificates/issue/:eventId', auth, requireRole('clubadmin'), wrap(async (req, res) => {
  const e = await Event.findById(req.params.eventId)
  if (!e || !sameClubOrSuper(req, e.club)) throw httpError(404, 'Event not found in your club.')
  const att = await Attendance.find({ event: e._id })
  if (!att.length) throw httpError(400, 'No verified attendance for this event yet.')
  const ops = att.map(a => ({ updateOne: { filter: { event: e._id, user: a.user }, update: { $setOnInsert: { event: e._id, user: a.user, club: e.club, title: e.title, issuedBy: req.user._id } }, upsert: true } }))
  await Certificate.bulkWrite(ops)
  await notify(att.map(a => a.user), { title: 'Certificate issued', message: `Your certificate for "${e.title}" is ready.`, type: 'certificate', link: '/certificates' })
  res.json({ issued: att.length })
}))
router.get('/certificates/mine', auth, wrap(async (req, res) => res.json(await Certificate.find({ user: req.user._id }).sort('-createdAt'))))
router.get('/certificates/verify/:code', wrap(async (req, res) => {
  const c = await Certificate.findOne({ verifyCode: req.params.code.toUpperCase() }).populate('user', 'name collegeId')
  if (!c) throw httpError(404, 'Invalid certificate code.')
  res.json(c)
}))

// ----- Sync mode: lets the React app keep its shared state in MongoDB -----
router.get('/state', wrap(async (_req, res) => {
  const doc = await PlatformState.findOne({ key: 'main' })
  res.json({ data: doc?.data || null, updatedAt: doc?.updatedAt || null })
}))
router.put('/state', auth, wrap(async (req, res) => {
  if (!req.body || typeof req.body.data !== 'object') throw httpError(400, 'data object required.')
  const doc = await PlatformState.findOneAndUpdate({ key: 'main' }, { data: req.body.data, updatedBy: req.user._id }, { upsert: true, new: true })
  res.json({ updatedAt: doc.updatedAt })
}))

module.exports = router
