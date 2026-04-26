type TelegramAlertOptions = {
  chatId?: string | null
}

export async function sendTelegramAlert(message: string, options?: TelegramAlertOptions): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = options?.chatId?.trim() || process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    })
    if (!res.ok) {
      console.error('[Telegram] send failed with status:', res.status)
      return false
    }
    return true
  } catch (err) {
    console.error('[Telegram] send failed:', err)
    return false
  }
}
