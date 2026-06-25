require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createAdmin() {
  await mongoose.connect('mongodb://127.0.0.1:27017/agrimonitor');

  const existing = await User.findOne({ email: 'admin@agrimonitor.com' });
  if (existing) {
    console.log('Admin user already exists.');
    process.exit(0);
  }

  const password = await bcrypt.hash('Admin@1234', 10);
  await User.create({
    userId: 'admin01',
    name: 'Admin',
    email: 'admin@agrimonitor.com',
    password,
    role: 'admin',
  });

  console.log('✅ Admin user created!');
  console.log('   Email:    admin@agrimonitor.com');
  console.log('   Password: Admin@1234');
  process.exit(0);
}

createAdmin().catch((err) => { console.error(err); process.exit(1); });
