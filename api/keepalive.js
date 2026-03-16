const { connectDB } = require('./_utils/db');
const { Session } = require('./_utils/db');
const { createSession } = require('./_utils/wa');

module.exports = async (req, res) => {
  await connectDB();

  const activeSessions = await Session.find({ isConnected: true });

  for (const session of activeSessions) {
    try {
      await createSession(session.phoneNumber);
      console.log(`Reconnected ${session.phoneNumber}`);
    } catch (error) {
      console.error(`Failed to reconnect ${session.phoneNumber}:`, error);
    }
  }

  res.status(200).json({ 
    message: 'Keepalive processed', 
    reconnected: activeSessions.length 
  });
};
