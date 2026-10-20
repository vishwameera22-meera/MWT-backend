const router = require('express').Router()
const Club = require('../models/Club')
const Membership = require('../models/Membership')
const User = require('../models/User')
const { auth, requireRole, sameClubOrSuper } = require('../middleware/auth')
const { httpError, wrap, notify } = require('../utils/helpers')

router.get('/', wrap(async (_req, res) => res.json(await Club.find().sort('name'))))
router.get('/:id', wrap(async (req, res) => {
  const club = await Club.findById(req.params.id)
  if (!club) throw httpError(404, 'Club not found.')
  res.json(club)
}))

router.patch('/:id', auth, requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const club = await Club.findById(req.params.id)
  if (!club) throw httpError(404, 'Club not found.')
  if (!sameClubOrSuper(req, club.name)) throw httpError(403, 'Not your club.')
  for (const k of ['tagline', 'description', 'vision', 'mission', 'fee', 'logo', 'domain']) if (req.body[k] !== undefined) club[k] = req.body[k]
  await club.save()
  res.json(club)
}))

// ----- Membership: students request, club admin decides -----
router.post('/:id/join', auth, requireRole('student'), wrap(async (req, res) => {
  const club = await Club.findById(req.params.id)
  if (!club) throw httpError(404, 'Club not found.')
  const m = await Membership.create({ user: req.user._id, club: club.name, status: 'pending', year: '2026-27' })
  const admin = await User.findOne({ role: 'clubadmin', club: club.name })
  if (admin) await notify([admin._id], { title: 'New join request', message: `${req.user.name} wants to join ${club.name}.`, type: 'registration' })
  res.status(201).json(m)
}))

router.get('/:id/requests', auth, requireRole('clubadmin', 'superadmin'), wrap(async (req, res) => {
  const club = await Club.findById(req.params.id)
  if (!club || !sameClubOrSuper(req, club.name)) throw httpError(403, 'Not your club.')
  res.json(await Membership.find({ club: club.name, status: { $in: ['pending', 'approved_pending_payment'] } }).populate('user', 'name collegeId department year photo'))
}))

router.patch('/requests/:memberId', auth, requireRole('clubadmin'), wrap(async (req, res) => {
  const m = await Membership.findById(req.params.memberId)
  if (!m || m.club !== req.user.club) throw httpError(404, 'Request not found.')
  const { decision } = req.body // 'approve' | 'reject'
  m.status = decision === 'approve' ? 'approved_pending_payment' : 'rejected'
  m.decidedBy = req.user._id
  await m.save()
  await notify([m.user], { title: `Membership ${decision === 'approve' ? 'approved' : 'declined'}`, message: `${m.club} has ${decision === 'approve' ? 'approved' : 'declined'} your request.`, type: 'registration' })
  res.json(m)
}))

router.post('/requests/:memberId/pay', auth, requireRole('student'), wrap(async (req, res) => {
  const m = await Membership.findOne({ _id: req.params.memberId, user: req.user._id })
  if (!m || m.status !== 'approved_pending_payment') throw httpError(400, 'Nothing to pay for.')
  m.status = 'active'; m.paid = true
  await m.save()
  res.json(m)
}))

router.get('/:id/members', auth, requireRole('clubadmin', 'studentmember', 'superadmin'), wrap(async (req, res) => {
  const club = await Club.findById(req.params.id)
  if (!club || !sameClubOrSuper(req, club.name)) throw httpError(403, 'Not your club.')
  res.json(await Membership.find({ club: club.name, status: 'active' }).populate('user', 'name collegeId department year photo email'))
}))

module.exports = router
