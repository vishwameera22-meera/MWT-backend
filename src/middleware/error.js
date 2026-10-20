module.exports = {
  notFound: (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }),
  errorHandler: (err, _req, res, _next) => {
    if (err.code === 11000) return res.status(409).json({ message: 'That record already exists.' })
    if (err.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors).map(e => e.message).join(' ') })
    if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id.' })
    const status = err.status || 500
    if (status === 500) console.error(err)
    res.status(status).json({ message: err.message || 'Server error' })
  }
}
