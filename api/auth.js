// /api/auth.js — Vercel Serverless Function (hardened headers)
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Inputs
  const channel = String(req.query.channel || '').trim().toLowerCase();
  const roomIdParam = Number(req.query.roomId || 0);
  if (!channel) return res.status(400).json({ error: 'missing channel' });

  // Browser-like headers (شبيهة جداً بكروم على ويندوز + client hints)
  const BASE_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const H = {
    'User-Agent': BASE_UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://kick.com',
    'Referer': `https://kick.com/${channel}`,
    // client hints
    'sec-ch-ua': '"Chromium";v="120", "Not A(Brand";v="24", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    // fetch metadata
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    // others
    'Upgrade-Insecure-Requests': '1',
    'Host': 'kick.com',
    'X-Requested-With': 'XMLHttpRequest'
  };

  try {
    // 0) Warm-up: خذ الكوكيز + HTML من صفحة القناة (أقرب ما يكون لزيارة متصفح)
    const warm = await fetch(`https://kick.com/${channel}`, {
      headers: {
        'User-Agent': BASE_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': H['Accept-Language'],
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': H['sec-ch-ua'],
        'sec-ch-ua-mobile': H['sec-ch-ua-mobile'],
        'sec-ch-ua-platform': H['sec-ch-ua-platform'],
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        'Host': 'kick.com'
      },
      redirect: 'follow'
    });

    const setCookies = warm.headers.get('set-cookie') || '';
    const cookieHeader = setCookies
      .split(/,(?=[^ ;]+=)/)       // split multiple cookies properly
      .map(s => s.split(';')[0])   // name=value only
      .filter(Boolean)
      .join('; ');
    const warmHtml = await warm.text();

    // 1) تحديد roomId
    let roomId = null;

    // 1-a) لو وصل roomId صريح من الكويري نستخدمه
    if (roomIdParam) {
      roomId = roomIdParam;
    } else {
      // 1-b) عبر API القناة
      try {
        const chRes = await fetch(`https://kick.com/api/v2/channels/${channel}`, {
          headers: { ...H, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
          redirect: 'follow'
        });
        const chText = await chRes.text();
        const ch = JSON.parse(chText);
        roomId = ch?.chatroom?.id || null;
      } catch { /* نكمل بالفولباك */ }

      // 1-c) Fallback: من HTML الصفحة
      if (!roomId && warmHtml) {
        const m1 = warmHtml.match(/"chatroom"\s*:\s*{[^}]*"id"\s*:\s*(\d+)/);
        const m2 = warmHtml.match(/"chatroom_id"\s*:\s*(\d+)/);
        roomId = (m1 && Number(m1[1])) || (m2 && Number(m2[1])) || null;
      }
    }

    if (!roomId) {
      return res.status(404).json({
        step: 'channel',
        error: 'no chatroom id',
        hint: 'Pass ?roomId=XXXX explicitly if channel is live.'
      });
    }

    // 2) جلب التوكن من auth (باستخدام نفس الكوكيز + هيدرز مشددة)
    const AUTH_HEADERS = {
      ...H,
      'Referer': `https://kick.com/${channel}`,
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    };

    const aRes = await fetch(`https://kick.com/api/v2/chatroom/${roomId}/auth`, {
      headers: AUTH_HEADERS,
      redirect: 'follow'
    });

    const aText = await aRes.text();
    let a;
    try {
      a = JSON.parse(aText);
    } catch {
      return res.status(502).json({
        step: 'auth',
        error: 'html-returned',
        status: aRes.status,
        bodyPreview: aText.slice(0, 200)
      });
    }

    const token = a?.token;
    if (!token) {
      return res.status(500).json({
        step: 'auth',
        error: 'no token',
        raw: a
      });
    }

    return res.status(200).json({ roomId, token });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
