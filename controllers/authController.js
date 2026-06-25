const User = require('../models/User');
const mockDb = require('../config/mockDb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Use mock database if MongoDB is not available
let userStore = User;

const register = async (req, res) => {
  try {
    const { userId, name, email, password, role } = req.body;

    if (!userId || !name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let existing = null;
    try {
      existing = await userStore.findOne({ $or: [{ email }, { userId }] });
    } catch (dbError) {
      console.warn('[Auth] Database error, falling back to mock DB:', dbError.message);
      userStore = mockDb;
      existing = await userStore.findOne({ $or: [{ email }, { userId }] });
    }

    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = await userStore.create({
      userId,
      name,
      email,
      password: hashed,
      role,
    });

    const userObj = { ...user };
    delete userObj.password;

    return res.status(201).json({ user: userObj });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Missing credentials' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    let user = null;
    try {
      // Try to use real database first
      user = await userStore.findOne({ email });
    } catch (dbError) {
      console.warn('[Auth] Database error, falling back to mock DB:', dbError.message);
      // Fall back to mock database
      userStore = mockDb;
      user = await userStore.findOne({ email });
    }

    if (user) {
      // --- Existing account: verify password regardless of role ---
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    } else {
      // --- No account found ---
      // Admins are never auto-created; reject immediately
      // (Admin accounts must be seeded via createAdmin.js)
      // For regular users: auto-create a permanent account on first login
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(password, salt);
      const autoUserId = 'u_' + Date.now();
      const autoName = email.split('@')[0];

      user = await userStore.create({
        userId: autoUserId,
        name: autoName,
        email,
        password: hashed,
        role: 'user',
      });
    }

    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone, location, coordinates, farmArea, soilType, phLevel, activeCrops } = req.body;

    const allowedFields = { name, phone, location, coordinates, farmArea, soilType, phLevel, activeCrops };
    const updates = Object.fromEntries(
      Object.entries(allowedFields).filter(([, v]) => v !== undefined)
    );

    // If multer saved a file, store the public URL path in MongoDB.
    // req.file is only present when a new image was uploaded.
    if (req.file) {
      updates.profilePic = `/uploads/${req.file.filename}`;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    // activeCrops arrives as a JSON string when sent via FormData — parse it
    if (typeof updates.activeCrops === 'string') {
      try { updates.activeCrops = JSON.parse(updates.activeCrops); }
      catch { updates.activeCrops = updates.activeCrops.split(',').map(s => s.trim()).filter(Boolean); }
    }

    const user = await User.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getProfile = async (req, res) => {
  try {
    let user = null;
    try {
      user = await userStore.findOne({ userId: req.user.userId });
    } catch (dbError) {
      console.warn('[Auth] Database error, falling back to mock DB:', dbError.message);
      userStore = mockDb;
      user = await userStore.findOne({ userId: req.user.userId });
    }
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Remove password before sending
    const userObj = { ...user };
    delete userObj.password;
    
    return res.json({ user: userObj });
  } catch (err) {
    console.error('[Auth] Get profile error:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { register, login, updateProfile, getProfile };
