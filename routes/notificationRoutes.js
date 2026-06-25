const express = require('express');
const router  = express.Router();
const { getNotifications, markOneRead, dismissAll } = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

// All routes require a valid JWT — userId is read from req.user.userId
router.get('/',                 verifyToken, getNotifications); // fetch all (unread first)
router.patch('/:id/read',       verifyToken, markOneRead);      // mark one as read
router.patch('/dismiss-all',    verifyToken, dismissAll);       // mark all as read

module.exports = router;
