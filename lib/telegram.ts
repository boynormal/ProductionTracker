type TelegramAlertOptions = {
  chatId?: string | null
}

export async function sendTelegramAlert(message: string, options?: TelegramAlertOptions): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = options?.chatId?.trim() || process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    })
  } catch (err) {
    console.error('[Telegram] send failed:', err)
  }
}
