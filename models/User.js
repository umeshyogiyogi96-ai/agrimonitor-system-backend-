const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    userId:      { type: String, required: true, unique: true },
    name:        { type: String, required: true },
    email:       { type: String, required: true, unique: true },
    password:    { type: String, required: true },
    role:        { type: String, enum: ['user', 'admin'], default: 'user' },
    // Extended profile & farm fields
    phone:       { type: String, default: '' },
    location:    { type: String, default: '' },
    coordinates: { type: String, default: '' },
    farmArea:    { type: String, default: '' },
    soilType:    { type: String, default: '' },
    phLevel:     { type: String, default: '' },
    activeCrops: { type: [String], default: [] },
    profilePic:  { type: String, default: '' },  // stored as '/uploads/filename.jpg'
    suspended:   { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
