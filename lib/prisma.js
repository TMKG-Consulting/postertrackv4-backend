// lib/prisma.js
const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'], // or ['query', 'error'] for debugging
  });
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['error'],
    });
  }
  prisma = global.prisma;
}

module.exports = prisma;
