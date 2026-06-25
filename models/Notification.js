const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    // Links notification to a specific user
    userId:    { type: String, required: true, index: true },
    title:     { type: String, required: true },
    message:   { type: String, required: true },
    // 'critical' | 'warning' | 'info' | 'success'
    type:      { type: String, enum: ['critical', 'warning', 'info', 'success'], default: 'info' },
    // false = unread (shows in badge), true = read (hidden from badge)
    isRead:    { type: Boolean, default: false, index: true },
  },
  { timestamps: true } // createdAt used as timestamp on frontend
);

module.exports = mongoose.model('Notification', NotificationSchema);
