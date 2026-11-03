const prisma = require('./prisma');

setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('DB keep-alive sent');
  } catch (err) {
    console.error('DB keep-alive failed:', err);
  }
}, 5 * 60 * 1000); // every 5 min
