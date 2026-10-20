const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const { notFound, errorHandler } = require('./middleware/error')

const app = express()
app.use(helmet())
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','), credentials: true }))
app.use(express.json({ limit: '25mb' }))          // event photos are sent as data URLs
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true }))

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'nec-clubconnect', time: new Date().toISOString() }))
app.use('/api/auth', require('./routes/auth'))
app.use('/api/users', require('./routes/users'))
app.use('/api/clubs', require('./routes/clubs'))
app.use('/api/events', require('./routes/events'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api', require('./routes/misc'))

app.use(notFound)
app.use(errorHandler)
module.exports = app
