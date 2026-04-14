/**
 * ทดสอบ Telegram bot — รัน: node --env-file=.env.local scripts/telegram-ping.mjs
 * ต้องมี TELEGRAM_BOT_TOKEN และ TELEGRAM_CHAT_ID ใน .env.local
 */
const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_CHAT_ID

if (!token || !chatId) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.')
  process.exit(1)
}

const base = `https://api.telegram.org/bot${token}`

const meRes = await fetch(`${base}/getMe`)
const me = await meRes.json()
if (!me.ok) {
  console.error('getMe failed:', me.description ?? me)
  process.exit(1)
}
console.log('getMe: ok — bot @' + (me.result?.username ?? '?'))

const sendRes = await fetch(`${base}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: '[Production Tracker] ทดสอบการส่งข้อความ — telegram-ping script',
  }),
})
const sent = await sendRes.json()
if (!sent.ok) {
  console.error('sendMessage failed:', sent.description ?? sent)
  process.exit(1)
}
console.log('sendMessage: ok — message_id', sent.result?.message_id)
