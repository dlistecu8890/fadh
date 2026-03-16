const { connectDB } = require('./_utils/db');
const { disconnectSession } = require('./_utils/wa');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await connectDB();

  const { phoneNumber } = req.body;
  
  try {
    await disconnectSession(phoneNumber);
    res.status(200).json({ success: true, message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
