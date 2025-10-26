// /api/auth.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const channel = String(req.query.channel || '').toLowerCase().trim();
  if (!channel) return res.status(400).json({ error: 'missing channel' });

  // UA و هيدرز شبيهة بالمتصفح
  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://kick.com',
    'Referer': `https://kick.com/${channel}`,
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty'
  };

  try {
    // 0) خذ الكوكيز من صفحة القناة (بعض الأحيان Kick يطلب presence cookie)
    const warm = await fetch(`https://kick.com/${channel}`, {
      headers: {
        'User-Agent': H['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': H['Accept-Language'],
        'Cache-Control': 'no-cache'
      },
      redirect: 'follow'
    });
    const setCookies = warm.headers.get('set-cookie') || '';
    const cookieHeader = setCookies
      .split(/,(?=[^ ;]+=)/) // افصل كوكيز متعددة
      .map(s => s.split(';')[0])
      .filter(Boolean)
      .join('; ');

    // 1) channel -> chatroom id
    const chRes = await fetch(`https://kick.com/api/v2/channels/${channel}`, {
      headers: { ...H, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
      redirect: 'follow'
    });
    const chText = await chRes.text();
    let ch;
    try { ch = JSON.parse(chText); }
    catch {
      return res.status(502).json({
        step:'channel', error:'html-returned', status: chRes.status,
        bodyPreview: chText.slice(0,180)
      });
    }
    const roomId = ch?.chatroom?.id;
    if (!roomId) return res.status(404).json({ step:'channel', error:'no chatroom id', chatroom: ch?.chatroom });

    // 2) auth -> token (مع نفس الكوكيز)
    const aRes = await fetch(`https://kick.com/api/v2/chatroom/${roomId}/auth`, {
      headers: { ...H, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
      redirect: 'follow'
    });
    const aText = await aRes.text();
    let a;
    try { a = JSON.parse(aText); }
    catch {
      return res.status(502).json({
        step:'auth', error:'html-returned', status: aRes.status,
        bodyPreview: aText.slice(0,180)
      });
    }
    const token = a?.token;
    if (!token) return res.status(500).json({ step:'auth', error:'no token', raw: a });

    return res.status(200).json({ roomId, token });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
