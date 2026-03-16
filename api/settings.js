const { connectDB } = require('./_utils/db');
const { getSessionStatus, updateSettings } = require('./_utils/wa');

module.exports = async (req, res) => {
  await connectDB();

  const { phone } = req.query;

  if (req.method === 'GET') {
    const status = await getSessionStatus(phone);
    return res.status(200).json({ settings: status.settings });
  }

  if (req.method === 'POST') {
    const newSettings = req.body;
    await updateSettings(phone, newSettings);
    return res.status(200).json({ success: true, message: 'Settings updated' });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
