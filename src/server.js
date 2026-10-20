require('dotenv').config()
const app = require('./app')
const connectDB = require('./config/db')

if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is not set. Copy .env.example to .env first.'); process.exit(1) }

const port = process.env.PORT || 5000
connectDB()
  .then(() => app.listen(port, () => console.log(`✓ NEC ClubConnect API running on http://localhost:${port}`)))
  .catch(err => { console.error('✗ Could not start server:', err.message); process.exit(1) })
