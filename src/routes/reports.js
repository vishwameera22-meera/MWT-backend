const router = require('express').Router()
const Event = require('../models/Event')
const EventReport = require('../models/EventReport')
const Registration = require('../models/Registration')
const Attendance = require('../models/Attendance')
const Circular = require('../models/Circular')
const WeeklyReport = require('../models/WeeklyReport')
const Membership = require('../models/Membership')
const User = require('../models/User')
const { auth, requireRole, sameClubOrSuper } = require('../middleware/auth')
const { httpError, wrap, notify } = require('../utils/helpers')

router.use(auth)

// ================= Event reports =================
// Student member / club admin generates a report per event
router.post('/events', requireRole('studentmember', 'clubadmin'), wrap(async (req, res) => {
  const event = await Event.findById(req.body.eventId)
  if (!event) throw httpError(404, 'Event not found.')
  if (!sameClubOrSuper(req, event.club)) throw httpError(403, 'This event belongs to another club.')
  const [registered, attended] = await Promise.all([Registration.countDocuments({ event: event._id }), Attendance.countDocuments({ event: event._id })])
  const report = await EventReport.create({
    event: event._id, club: event.club, eventTitle: event.title, venue: req.body.venue || event.venue, date: event.date,
    paragraphs: req.body.paragraphs || [], photos: req.body.photos || [], registered, attended, generatedBy: req.user._id
  })
  res.status(201).json(report)
}))

// Staff see their club's reports; super admin sees submitted ones; students only see reports sent to them
router.get('/events', wrap(async (req, res) => {
  let q
  if (req.user.role === 'student') q = { sentTo: req.user._id }
  else if (req.user.role === 'superadmin') q = { status: 'submitted', ...(req.query.club ? { club: req.query.club } : {}) }
  else q = { club: req.user.club }
  res.json(await EventReport.find(q).sort('-createdAt'))
}))

router.get('/events/:id', wrap(async (req, res) => {
  const r = await EventReport.findById(req.params.id)
  if (!r) throw httpError(404, 'Report not found.')
  if (req.user.role === 'student' && !r.sentTo.map(String).includes(String(req.user._id))) throw httpError(403, 'This report was not shared with you.')
  if (['clubadmin', 'studentmember'].includes(req.user.role) && req.user.club !== r.club) throw httpError(403, 'Not your club.')
  res.json(r)
}))

router.patch('/events/:id', requireRole('studentmember', 'clubadmin'), wrap(async (req, res) => {
  const r = await EventReport.findById(req.params.id)
  if (!r || r.club !== req.user.club) throw httpError(404, 'Report not found.')
  if (r.status === 'submitted') throw httpError(400, 'Submitted reports are locked.')
  for (const k of ['paragraphs', 'photos', 'venue']) if (req.body[k] !== undefined) r[k] = req.body[k]
  await r.save(); res.json(r)
}))

// Student member submits the report to the club admin / super admin
router.post('/events/:id/submit', requireRole('studentmember', 'clubadmin'), wrap(async (req, res) => {
  const r = await EventReport.findById(req.params.id)
  if (!r || r.club !== req.user.club) throw httpError(404, 'Report not found.')
  r.status = 'submitted'; r.submittedAt = new Date(); await r.save()
  const admin = await User.findOne({ role: 'clubadmin', club: r.club })
  if (admin) await notify([admin._id], { title: 'Event report submitted', message: `${req.user.name} submitted the report for "${r.eventTitle}".`, type: 'event', link: `/reports/${r.id}` })
  res.json(r)
}))

// Send the report ONLY to selected students who registered for / attended the event
router.post('/events/:id/send', requireRole('studentmember', 'clubadmin'), wrap(async (req, res) => {
  const r = await EventReport.findById(req.params.id)
  if (!r || r.club !== req.user.club) throw httpError(404, 'Report not found.')
  const ids = [...new Set((req.body.userIds || []).map(String))]
  const regs = await Registration.find({ event: r.event, user: { $in: ids } })
  const allowed = regs.map(x => String(x.user))
  if (!allowed.length) throw httpError(400, 'No valid registered students selected.')
  r.sentTo = [...new Set([...r.sentTo.map(String), ...allowed])]
  await r.save()
  await notify(allowed, { title: `Event report: ${r.eventTitle}`, message: `${r.club} shared the event report with you.`, type: 'event', link: `/reports/${r.id}` })
  res.json({ sent: allowed.length, report: r })
}))

// ================= Circulars =================
router.post('/circulars', requireRole('studentmember', 'clubadmin'), wrap(async (req, res) => {
  const c = await Circular.create({ ...req.body, club: req.user.club, createdBy: req.user._id, issuedOn: new Date().toISOString().slice(0, 10) })
  res.status(201).json(c)
}))
router.get('/circulars', wrap(async (req, res) => {
  const q = ['clubadmin', 'studentmember'].includes(req.user.role) ? { club: req.user.club } : (req.query.club ? { club: req.query.club } : {})
  res.json(await Circular.find(q).sort('-createdAt'))
}))
router.get('/circulars/:id', wrap(async (req, res) => {
  const c = await Circular.findById(req.params.id)
  if (!c) throw httpError(404, 'Circular not found.')
  res.json(c)
}))
router.delete('/circulars/:id', requireRole('studentmember', 'clubadmin'), wrap(async (req, res) => {
  const c = await Circular.findOne({ _id: req.params.id, club: req.user.club })
  if (!c) throw httpError(404, 'Circular not found.')
  await c.deleteOne(); res.json({ message: 'Circular deleted.' })
}))

// ================= Weekly reports (club admin -> HOD / super admin verification) =================
router.post('/weekly', requireRole('clubadmin'), wrap(async (req, res) => {
  const { startDate, endDate, summary, achievements, plans, submittedTo } = req.body
  const events = await Event.find({ club: req.user.club, date: { $gte: startDate, $lte: endDate } })
  const rows = await Promise.all(events.map(async e => ({
    id: String(e._id), title: e.title, date: e.date, venue: e.venue,
    registered: await Registration.countDocuments({ event: e._id }), attended: await Attendance.countDocuments({ event: e._id })
  })))
  const w = await WeeklyReport.create({ club: req.user.club, startDate, endDate, weekLabel: `${startDate} to ${endDate}`, summary, achievements, plans, submittedTo, events: rows, submittedBy: req.user._id })
  const supers = await User.find({ role: 'superadmin' })
  await notify(supers.map(s => s._id), { title: 'Weekly report to verify', message: `${req.user.club} submitted a weekly report (${w.weekLabel}).`, type: 'event' })
  res.status(201).json(w)
}))
router.get('/weekly', requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  res.json(await WeeklyReport.find(req.user.role === 'clubadmin' ? { club: req.user.club } : {}).sort('-createdAt'))
}))
router.patch('/weekly/:id/verify', requireRole('superadmin'), wrap(async (req, res) => {
  const w = await WeeklyReport.findById(req.params.id)
  if (!w) throw httpError(404, 'Report not found.')
  if (!['verified', 'rejected'].includes(req.body.decision)) throw httpError(400, 'decision must be "verified" or "rejected".')
  w.status = req.body.decision; w.remarks = req.body.remarks; w.verifiedBy = req.user._id; w.verifiedAt = new Date()
  await w.save()
  const admin = await User.findOne({ role: 'clubadmin', club: w.club })
  if (admin) await notify([admin._id], { title: `Weekly report ${w.status}`, message: `${w.weekLabel}: ${w.remarks || w.status}`, type: 'event' })
  res.json(w)
}))

// ================= Monthly report (auto-compiled) =================
router.get('/monthly', requireRole('clubadmin', 'studentmember', 'superadmin'), wrap(async (req, res) => {
  const club = req.user.role === 'superadmin' ? req.query.club : req.user.club
  const month = req.query.month || new Date().toISOString().slice(0, 7)
  if (!club) throw httpError(400, 'club is required.')
  const events = await Event.find({ club, date: new RegExp(`^${month}`) }).sort('date')
  const rows = await Promise.all(events.map(async e => ({
    event: e, registered: await Registration.countDocuments({ event: e._id }), attended: await Attendance.countDocuments({ event: e._id }),
    report: await EventReport.findOne({ event: e._id }).select('paragraphs status')
  })))
  res.json({
    club, month, events: rows,
    totals: { events: rows.length, registered: rows.reduce((n, r) => n + r.registered, 0), attended: rows.reduce((n, r) => n + r.attended, 0) },
    circulars: await Circular.find({ club, issuedOn: new RegExp(`^${month}`) }),
    weeklyReports: await WeeklyReport.find({ club, startDate: new RegExp(`^${month}`) }),
    activeMembers: await Membership.countDocuments({ club, status: 'active' })
  })
}))

module.exports = router
