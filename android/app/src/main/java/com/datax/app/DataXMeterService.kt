package com.datax.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.net.TrafficStats
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import java.util.concurrent.TimeUnit

class DataXMeterService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences(PREFS, MODE_PRIVATE) }
    private val sampler = object : Runnable {
        override fun run() {
            sampleCounters()
            handler.postDelayed(this, TimeUnit.MINUTES.toMillis(1))
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        if (!prefs.getBoolean("running", false)) {
            prefs.edit().putBoolean("running", true).putLong("started_at", System.currentTimeMillis())
                .putLong("last_rx", TrafficStats.getTotalRxBytes()).putLong("last_tx", TrafficStats.getTotalTxBytes()).apply()
        }
        handler.removeCallbacks(sampler)
        handler.post(sampler)
        return START_STICKY
    }

    private fun sampleCounters() {
        val rx = TrafficStats.getTotalRxBytes()
        val tx = TrafficStats.getTotalTxBytes()
        if (rx >= 0 && tx >= 0) {
            val oldRx = prefs.getLong("last_rx", rx)
            val oldTx = prefs.getLong("last_tx", tx)
            val rxDelta = (rx - oldRx).coerceAtLeast(0L)
            val txDelta = (tx - oldTx).coerceAtLeast(0L)
            prefs.edit()
                .putLong("rx_total", prefs.getLong("rx_total", 0L) + rxDelta)
                .putLong("tx_total", prefs.getLong("tx_total", 0L) + txDelta)
                .putLong("last_rx", rx)
                .putLong("last_tx", tx)
                .putLong("last_sample_at", System.currentTimeMillis())
                .putBoolean("running", true)
                .apply()
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "DataX background meter", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Shows when the user-started device usage meter is running."
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val openApp = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 2, Intent(this, DataXMeterService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val rx = prefs.getLong("rx_total", 0L) / (1024.0 * 1024.0)
        val tx = prefs.getLong("tx_total", 0L) / (1024.0 * 1024.0)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setContentTitle("DataX background meter active")
            .setContentText("Device traffic observed · RX %.1f MB · TX %.1f MB".format(rx, tx))
            .setContentIntent(openApp)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stop)
            .build()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // The foreground service intentionally continues after the app screen is dismissed.
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        handler.removeCallbacks(sampler)
        prefs.edit().putBoolean("running", false).apply()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val PREFS = "datax_background_meter"
        const val ACTION_START = "com.datax.app.METER_START"
        const val ACTION_STOP = "com.datax.app.METER_STOP"
        const val CHANNEL_ID = "datax_meter"
        const val NOTIFICATION_ID = 4301
    }
}
