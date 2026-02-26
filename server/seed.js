const prisma = require('./lib/prisma');

/**
 * Ensure the ADMIN_EMAIL user exists and is approved with role "admin".
 * Called once on server startup.
 */
async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn('[seed] ADMIN_EMAIL not set — skipping admin seed.');
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existing) {
    // Make sure they're admin + approved
    if (existing.role !== 'admin' || existing.status !== 'approved') {
      await prisma.user.update({
        where: { email: adminEmail },
        data: { role: 'admin', status: 'approved' },
      });
      console.log(`[seed] Promoted ${adminEmail} to admin.`);
    }
    return;
  }

  await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'Admin',
      role: 'admin',
      status: 'approved',
    },
  });
  console.log(`[seed] Created admin user: ${adminEmail}`);
}

module.exports = seedAdmin;
