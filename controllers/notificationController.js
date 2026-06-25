const Notification = require('../models/Notification');

// Seed default alerts for a brand-new user who has no notifications yet
const DEFAULT_NOTIFICATIONS = [
  { title: 'Soil Moisture Critically Low',  message: 'Soil moisture dropped to 18% — below safe threshold of 20%.',             type: 'critical' },
  { title: 'Temperature Exceeds Limit',     message: 'Field temperature reached 35.5°C — exceeds max threshold of 35°C.',        type: 'critical' },
  { title: 'Humidity Level High',           message: 'Relative humidity at 78% — monitor for mold risk.',                        type: 'warning'  },
  { title: 'Sensor Connection Unstable',    message: 'Humidity sensor (GPIO 5) showing intermittent connection.',                 type: 'warning'  },
  { title: 'Temperature Normalized',        message: 'Field temperature returned to optimal range. No action needed.',            type: 'info'     },
];

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns ALL notifications for the logged-in user (unread first).
// If the user has no notifications yet, seeds the defaults and returns them.
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    let notifications = await Notification.find({ userId })
      .sort({ isRead: 1, createdAt: -1 }) // unread first, then newest
      .lean();

    // First-time user: seed default notifications into the database
    if (notifications.length === 0) {
      const seeded = await Notification.insertMany(
        DEFAULT_NOTIFICATIONS.map((n) => ({ ...n, userId, isRead: false }))
      );
      notifications = seeded.map((n) => n.toObject());
    }

    return res.json(notifications);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
// Marks a single notification as read. Badge count drops by 1 immediately.
const markOneRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId  = req.user.userId;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },        // only update if it belongs to this user
      { isRead: true },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    return res.json(notification);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/notifications/dismiss-all ─────────────────────────────────────
// Sets isRead = true for ALL unread notifications of this user.
// Badge count goes to 0 permanently — survives page refresh.
const dismissAll = async (req, res) => {
  try {
    const userId = req.user.userId;

    await Notification.updateMany(
      { userId, isRead: false },   // only target unread ones
      { $set: { isRead: true } }
    );

    return res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { getNotifications, markOneRead, dismissAll };
