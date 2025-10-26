import express from 'express';
import fetch from 'node-fetch';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  next();
});

async function getAuth(channel){
  const H = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `https://kick.com/${channel}`,
    'Origin': 'https://kick.com'
  };
  const chRes = await fetch(`https://kick.com/api/v2/channels/${channel}`, { headers: H });
  const ch = await chRes.json();
  const roomId = ch?.chatroom?.id;
  if (!roomId) throw new Error('no chatroom id');
  const aRes = await fetch(`https://kick.com/api/v2/chatroom/${roomId}/auth`, { headers: H });
  const a = await aRes.json();
  const token = a?.token;
  if (!token) throw new Error('no token');
  return { roomId, token };
}

app.get('/auth', async (req,res)=>{
  try{
    const ch = String(req.query.channel||'').toLowerCase();
    if (!ch) return res.status(400).json({ error:'missing channel' });
    const data = await getAuth(ch);
    res.json(data);
  }catch(e){
    res.status(500).json({ error: String(e) });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', async (client, req) => {
  try{
    const url = new URL(req.url, 'http://localhost');
    const channel = url.pathname.split('/').pop() || url.searchParams.get('channel') || '';
    if (!channel){ client.close(); return; }
    const { token } = await getAuth(String(channel).toLowerCase());
    const kick = new WebSocket(`wss://ws.chat.kick.com/?token=${encodeURIComponent(token)}`);
    kick.on('message', (buf)=> client.send(buf.toString()));
    kick.on('close', ()=> client.close());
    kick.on('error', ()=> { try{ client.send(JSON.stringify({ type:'error', src:'kick' })); }catch{}; });
    client.on('close', ()=> { try{ kick.close(); }catch{}; });
  }catch(e){
    try{ client.send(JSON.stringify({ type:'error', msg:String(e) })); }catch{}
    client.close();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('listening on', PORT));
