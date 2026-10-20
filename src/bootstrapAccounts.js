// The five institutional bootstrap logins required to operate NEC ClubConnect.
// These are real, working accounts (not demo content): the Super Admin needs at
// least one Club Admin per club to hand over operations, every club needs a
// Student Member for the attendance desk, and students sign in with their
// register-number mail. Change every password after the first sign-in.
//
// `npm run seed` creates any of these that do not exist yet (idempotent), and
// `npm run verify:logins` signs in as each one and checks its role + JWT.
// The same directory is mirrored in frontend/src/data/mockUsers.js so that the
// browser-only mode has the identical five logins.
const accounts = [
  {
    key: 'superadmin',
    name: process.env.SUPERADMIN_NAME || 'Super Admin',
    email: process.env.SUPERADMIN_EMAIL || 'superadmin@nec.edu.in',
    password: process.env.SUPERADMIN_PASSWORD || 'ChangeMe@123',
    role: 'superadmin',
    department: 'Administration',
    summary: 'campus-wide oversight of all six clubs'
  },
  {
    key: 'ieeeadmin',
    name: 'IEEE Club Admin',
    email: 'ieeeadmin@nec.edu.in',
    password: 'IeeeAdmin@123',
    role: 'clubadmin',
    club: 'IEEE',
    department: 'ADMIN',
    summary: 'full operations for the IEEE student branch'
  },
  {
    key: 'csiadmin',
    name: 'CSI Club Admin',
    email: 'csiadmin@nec.edu.in',
    password: 'CsiAdmin@123',
    role: 'clubadmin',
    club: 'CSI',
    department: 'ADMIN',
    summary: 'full operations for the CSI student chapter'
  },
  {
    key: 'ieeecoordinator',
    name: 'IEEE Student Member',
    email: 'ieeecoordinator@nec.edu.in',
    password: 'Coord@123456',
    role: 'studentmember',
    club: 'IEEE',
    collegeId: '24104130',
    department: 'ECE',
    year: '3rd Year',
    position: 'Student Member / IEEE Coordinator',
    summary: 'IEEE attendance desk, circulars and event coordination'
  },
  {
    key: 'student',
    name: 'Karthik Raja S',
    email: '24104124@nec.edu.in',
    password: 'Student@123456',
    role: 'student',
    collegeId: '24104124',
    department: 'CSE',
    year: '2nd Year',
    summary: 'normal student login (register-number mail id)'
  }
]

module.exports = accounts
