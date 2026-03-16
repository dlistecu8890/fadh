const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  phoneNumber: { type: String, unique: true, required: true },
  credentials: { type: Object, default: {} },
  settings: {
    menfess: { type: Boolean, default: true },
    confess: { type: Boolean, default: true },
    autoTyping: { type: Boolean, default: false },
    autoRecord: { type: Boolean, default: false },
    onlinePresence: { type: Boolean, default: true },
    packname: { type: String, default: 'Sairi Bot' },
    author: { type: String, default: '@Sairi Botz' },
    groupLink: String,
    channelLink: String
  },
  isConnected: { type: Boolean, default: false },
  pairingCode: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;
  
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema);

module.exports = { connectDB, Session };
