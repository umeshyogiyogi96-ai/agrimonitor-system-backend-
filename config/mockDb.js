/**
 * Mock In-Memory Database for Development
 * Used when MongoDB is not accessible
 * This is for development only - data is lost on server restart
 */

class MockUserStore {
  constructor() {
    this.users = new Map();
    // Add a default test admin user
    this.users.set('admin@test.com', {
      userId: 'admin_001',
      name: 'Admin User',
      email: 'admin@test.com',
      password: '$2b$10$DCSWm9Rvt5fEmuCLx2lOOODQXakl3NNJGLKciFOHg/0Xny/5qaDD6', // bcrypt of 'admin123'
      role: 'admin',
      phone: '+1234567890',
      location: 'Farm, USA',
      coordinates: '',
      farmArea: '100 acres',
      soilType: 'Loamy',
      phLevel: '7.0',
      activeCrops: ['Wheat', 'Corn'],
      profilePic: '',
      suspended: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Add a default test user
    this.users.set('user@test.com', {
      userId: 'user_001',
      name: 'Test User',
      email: 'user@test.com',
      password: '$2b$10$ZniMlzMCN4LLmnTJFcNnmutXgX3pqWgUOK3Qqe8FE4CaCEsBXM8QG', // bcrypt of 'test123'
      role: 'user',
      phone: '',
      location: '',
      coordinates: '',
      farmArea: '',
      soilType: '',
      phLevel: '',
      activeCrops: [],
      profilePic: '',
      suspended: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  findOne(query) {
    if (query.email) {
      return Promise.resolve(this.users.get(query.email) || null);
    }
    if (query.$or) {
      for (const condition of query.$or) {
        if (condition.email && this.users.has(condition.email)) {
          return Promise.resolve(this.users.get(condition.email));
        }
        if (condition.userId) {
          for (const user of this.users.values()) {
            if (user.userId === condition.userId) {
              return Promise.resolve(user);
            }
          }
        }
      }
    }
    return Promise.resolve(null);
  }

  create(userData) {
    const user = {
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(userData.email, user);
    return Promise.resolve(user);
  }

  findOneAndUpdate(query, update, options = {}) {
    if (query.userId) {
      for (const user of this.users.values()) {
        if (user.userId === query.userId) {
          const updated = { ...user, ...update.$set, updatedAt: new Date() };
          this.users.set(user.email, updated);
          return Promise.resolve(options.new ? updated : user);
        }
      }
    }
    return Promise.resolve(null);
  }

  find(query = {}) {
    return Promise.resolve(Array.from(this.users.values()));
  }

  toObject() {
    return this;
  }
}

module.exports = new MockUserStore();
