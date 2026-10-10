package io.github.kaminarios.whip

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/** Uses the user's installed speech service, including its recording UI and consent. */
class WhipDictationModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), ActivityEventListener {
  private var pending: Promise? = null

  init { context.addActivityEventListener(this) }
  override fun getName() = "WhipDictation"

  @ReactMethod
  fun recognize(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      if (pending != null) {
        promise.reject("E_DICTATION_BUSY", "Voice recording is already open")
        return@runOnUiThread
      }
      val activity = context.currentActivity
      if (activity == null) {
        promise.reject("E_DICTATION_UNAVAILABLE", "Open Whip Chat to record a message")
        return@runOnUiThread
      }
      pending = promise
      try {
        activity.startActivityForResult(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_PROMPT, "Record a message — review it before sending")
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }, REQUEST_DICTATION)
      } catch (error: ActivityNotFoundException) {
        pending = null
        promise.reject("E_DICTATION_UNAVAILABLE", "No speech recognition service is installed. Use your keyboard microphone or install a speech service.", error)
      } catch (error: Exception) {
        pending = null
        promise.reject("E_DICTATION_FAILED", "Could not start voice recording", error)
      }
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_DICTATION) return
    val promise = pending ?: return
    pending = null
    promise.resolve(if (resultCode == Activity.RESULT_OK) {
      data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
    } else null)
  }

  override fun onNewIntent(intent: Intent) = Unit

  override fun invalidate() {
    context.removeActivityEventListener(this)
    UiThreadUtil.runOnUiThread {
      pending?.resolve(null)
      pending = null
    }
    super.invalidate()
  }

  companion object { private const val REQUEST_DICTATION = 7720 }
}
