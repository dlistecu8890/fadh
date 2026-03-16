const { connectDB } = require('./_utils/db');
const { getSessionStatus } = require('./_utils/wa');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await connectDB();

  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  try {
    const status = await getSessionStatus(phone);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
