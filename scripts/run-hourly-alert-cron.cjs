const cron = require('node-cron')

const schedule = process.env.TELEGRAM_HOURLY_CRON_SCHEDULE || '*/10 * * * *'
const baseUrl = (process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || '3001'}`).replace(/\/$/, '')
const cronSecret = process.env.CRON_SECRET || ''
const endpoint = `${baseUrl}/api/notifications/hourly`

async function triggerHourlyAlert() {
  try {
    const headers = {}
    if (cronSecret) {
      headers.Authorization = `Bearer ${cronSecret}`
    }

    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
    })

    const text = await res.text()
    if (!res.ok) {
      console.error(`[hourly-alert-cron] HTTP ${res.status}: ${text}`)
      return
    }

    console.log(`[hourly-alert-cron] Triggered successfully: ${text}`)
  } catch (error) {
    console.error('[hourly-alert-cron] Trigger failed:', error)
  }
}

console.log(`[hourly-alert-cron] Starting with schedule ${schedule}`)
console.log(`[hourly-alert-cron] Endpoint: ${endpoint}`)

cron.schedule(schedule, () => {
  void triggerHourlyAlert()
})

void triggerHourlyAlert()
