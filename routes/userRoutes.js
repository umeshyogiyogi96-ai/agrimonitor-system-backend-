const path    = require('path');
const fs      = require('fs');
const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { updateProfile, getProfile } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

// ── Multer disk storage configuration ────────────────────────────────────────
// Equivalent to Flask's secure_filename + os.path.join(UPLOAD_FOLDER, filename)

// Ensure the uploads folder exists (creates it if not present)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  // Save every uploaded file into backend/uploads/
  destination: (_req, _file, cb) => cb(null, uploadsDir),

  // Name the file with a timestamp prefix to avoid collisions:
  // e.g. "1718000000000-profile.jpg"
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}${ext}`);
  },
});

// Only accept image files (jpg, png, webp, gif, etc.)
const fileFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/profile', verifyToken, getProfile);

// upload.single('profilePic') parses multipart/form-data and attaches:
//   req.file  → the uploaded image file info
//   req.body  → all text fields (name, phone, location, etc.)
router.put('/profile', verifyToken, upload.single('profilePic'), updateProfile);

module.exports = router;
