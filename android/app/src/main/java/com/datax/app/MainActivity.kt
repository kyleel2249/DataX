package com.datax.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.ActivityCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : android.app.Activity() {
    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4102)
        }

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.addJavascriptInterface(DataXNativeBridge(this), "DataXNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.host == "appassets.androidplatform.net") return false
                if (uri.scheme == "https" || uri.scheme == "http") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
                return true
            }
        }
        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html")
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}

class DataXNativeBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun startMetering(): String {
        val intent = Intent(activity, DataXMeterService::class.java).setAction(DataXMeterService.ACTION_START)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) activity.startForegroundService(intent) else activity.startService(intent)
        return "started"
    }

    @JavascriptInterface
    fun stopMetering(): String {
        activity.stopService(Intent(activity, DataXMeterService::class.java))
        return "stopped"
    }

    @JavascriptInterface
    fun getMeteringSnapshot(): String {
        val prefs = activity.getSharedPreferences(DataXMeterService.PREFS, 0)
        return JSONObject().apply {
            put("running", prefs.getBoolean("running", false))
            put("rxBytes", prefs.getLong("rx_total", 0L))
            put("txBytes", prefs.getLong("tx_total", 0L))
            put("lastSampleAt", prefs.getLong("last_sample_at", 0L))
            put("startedAt", prefs.getLong("started_at", 0L))
            put("scope", "device-wide-aggregate")
        }.toString()
    }
}
