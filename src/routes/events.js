const router = require('express').Router()
const Event = require('../models/Event')
const Registration = require('../models/Registration')
const Attendance = require('../models/Attendance')
const Feedback = require('../models/Feedback')
const User = require('../models/User')
const { auth, requireRole, sameClubOrSuper } = require('../middleware/auth')
const { httpError, wrap, notify } = require('../utils/helpers')

const staffOf = (req, event) => {
  if (!sameClubOrSuper(req, event.club)) throw httpError(403, 'This event belongs to another club.')
}
const loadEvent = async (id) => {
  const e = await Event.findById(id)
  if (!e) throw httpError(404, 'Event not found.')
  return e
}

// Public list. Newly created events appear here (and on the home page) instantly.
router.get('/', wrap(async (req, res) => {
  const q = {}
  if (req.query.club) q.club = req.query.club
  let list = await Event.find(q).sort('date')
  if (req.query.status) list = list.filter(e => e.status === req.query.status)   // upcoming | ongoing | completed
  res.json(list)
}))
router.get('/:id', wrap(async (req, res) => res.json(await loadEvent(req.params.id))))

router.post('/', auth, requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const club = req.user.role === 'clubadmin' ? req.user.club : req.body.club
  const event = await Event.create({ ...req.body, club, createdBy: req.user._id, organizerName: req.body.organizerName || req.user.name })
  res.status(201).json(event)
}))

router.patch('/:id', auth, requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  for (const k of ['title', 'description', 'category', 'date', 'time', 'venue', 'capacity', 'fee', 'participationType']) if (req.body[k] !== undefined) e[k] = req.body[k]
  await e.save(); res.json(e)
}))

router.post('/:id/postpone', auth, requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  e.date = req.body.newDate || e.date; e.time = req.body.newTime || e.time; e.postponedReason = req.body.reason
  await e.save()
  const regs = await Registration.find({ event: e._id })
  await notify(regs.map(r => r.user), { title: 'Event rescheduled', message: `"${e.title}" is now on ${e.date}. ${req.body.reason || ''}`, type: 'event', link: `/events/${e.id}` })
  res.json(e)
}))

router.post('/:id/complete', auth, requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  e.completed = true; await e.save(); res.json(e)
}))

router.delete('/:id', auth, requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  await Promise.all([e.deleteOne(), Registration.deleteMany({ event: e._id }), Attendance.deleteMany({ event: e._id })])
  res.json({ message: 'Event deleted.' })
}))

// ---------- Registration ----------
router.post('/:id/register', auth, requireRole('student'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id)
  if (e.status === 'completed') throw httpError(400, 'Registration is closed for this event.')
  if (e.capacity && await Registration.countDocuments({ event: e._id }) >= e.capacity) throw httpError(400, 'Event is full.')
  const r = await Registration.create({ event: e._id, user: req.user._id, teamName: req.body.teamName, teamMembers: req.body.teamMembers })
  await notify([req.user._id], { title: 'Registration confirmed', message: `You are registered for "${e.title}".`, type: 'registration', link: `/events/${e.id}` })
  res.status(201).json(r)
}))
router.delete('/:id/register', auth, requireRole('student'), wrap(async (req, res) => {
  await Registration.deleteOne({ event: req.params.id, user: req.user._id })
  await Attendance.deleteOne({ event: req.params.id, user: req.user._id })
  res.json({ message: 'Registration cancelled.' })
}))
router.get('/mine/registrations', auth, wrap(async (req, res) => res.json(await Registration.find({ user: req.user._id }).populate('event'))))

router.get('/:id/registrations', auth, requireRole('clubadmin', 'studentmember', 'superadmin'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  res.json(await Registration.find({ event: e._id }).populate('user', 'name collegeId department year photo email'))
}))

// ---------- Attendance (verified by coordinator against the registered list) ----------
router.get('/:id/attendance', auth, requireRole('clubadmin', 'studentmember', 'superadmin'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  const [regs, att] = await Promise.all([
    Registration.find({ event: e._id }).populate('user', 'name collegeId department year photo'),
    Attendance.find({ event: e._id })
  ])
  const present = new Map(att.map(a => [String(a.user), a]))
  const rows = regs.map(r => ({ user: r.user, registered: true, attended: present.has(String(r.user._id)), markedAt: present.get(String(r.user._id))?.markedAt }))
  res.json({ registered: rows.length, attended: att.length, pending: rows.length - att.length, rows })
}))

// Body: { userIds: [...] } — the students the coordinator ticked as present.
// Verification: every id must be on the registered list, otherwise nothing is saved.
router.post('/:id/attendance/verify', auth, requireRole('clubadmin', 'studentmember'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  const ids = [...new Set((req.body.userIds || []).map(String))]
  if (!ids.length) throw httpError(400, 'Tick at least one student.')
  const regs = await Registration.find({ event: e._id, user: { $in: ids } })
  const registeredIds = new Set(regs.map(r => String(r.user)))
  const unregistered = ids.filter(id => !registeredIds.has(id))
  if (unregistered.length) throw httpError(400, `${unregistered.length} ticked student(s) are not on the registered list.`)
  const ops = ids.map(user => ({ updateOne: { filter: { event: e._id, user }, update: { $setOnInsert: { event: e._id, user, markedBy: req.user._id, markedAt: new Date() } }, upsert: true } }))
  await Attendance.bulkWrite(ops)
  await notify(ids, { title: 'Attendance recorded', message: `Your attendance for "${e.title}" was verified.`, type: 'checkin', link: `/events/${e.id}` })
  res.json({ marked: ids.length })
}))

router.delete('/:id/attendance/:userId', auth, requireRole('clubadmin', 'studentmember'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  await Attendance.deleteOne({ event: e._id, user: req.params.userId })
  res.json({ message: 'Attendance removed.' })
}))

// ---------- Feedback (only students whose attendance was verified) ----------
router.post('/:id/feedback', auth, requireRole('student'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id)
  if (!(await Attendance.exists({ event: e._id, user: req.user._id }))) throw httpError(403, 'Only verified attendees can give feedback.')
  const f = await Feedback.findOneAndUpdate({ event: e._id, user: req.user._id }, { club: e.club, rating: req.body.rating, comment: req.body.comment }, { upsert: true, new: true, runValidators: true })
  res.status(201).json(f)
}))
router.get('/:id/feedback', auth, requireRole('clubadmin', 'studentmember', 'superadmin'), wrap(async (req, res) => {
  const e = await loadEvent(req.params.id); staffOf(req, e)
  res.json(await Feedback.find({ event: e._id }).populate('user', 'name collegeId'))
}))

module.exports = router
