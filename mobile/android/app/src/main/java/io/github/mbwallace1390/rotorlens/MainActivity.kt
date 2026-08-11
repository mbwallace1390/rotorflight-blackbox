package io.github.mbwallace1390.rotorlens

import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  private val massStorageHandler = Handler(Looper.getMainLooper())
  private val massStorageCoordinator by lazy {
    MassStorageImportPreferences.coordinator(this)
  }
  private var pendingMassStorageDispatch: Runnable? = null

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "RotorLens"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onPostResume() {
    super.onPostResume()
    scheduleMassStorageDispatch()
  }

  override fun onPause() {
    pendingMassStorageDispatch?.let(massStorageHandler::removeCallbacks)
    pendingMassStorageDispatch = null
    super.onPause()
  }

  fun isMassStorageImportHostForeground(): Boolean =
      !isFinishing &&
          !isDestroyed &&
          lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)

  private fun scheduleMassStorageDispatch() {
    if (pendingMassStorageDispatch != null) {
      return
    }

    val ticket = massStorageCoordinator.prepareDispatch(System.currentTimeMillis()) ?: return
    val requestId = ticket.requestId
    lateinit var dispatch: Runnable
    dispatch = Runnable {
      if (pendingMassStorageDispatch !== dispatch) {
        return@Runnable
      }
      pendingMassStorageDispatch = null

      // onPause normally cancels this callback; this guard also covers a
      // lifecycle transition already queued on the main thread.
      if (!isMassStorageImportHostForeground()) {
        return@Runnable
      }

      val viewerIntent = Intent(this, ViewerActivity::class.java).apply {
        putExtra(ViewerActivity.EXTRA_PICK_IMMEDIATELY, true)
        putExtra(ViewerActivity.EXTRA_PICK_REQUEST_ID, requestId)
      }
      if (!massStorageCoordinator.consumeForDispatch(requestId, System.currentTimeMillis())) {
        return@Runnable
      }
      startActivity(viewerIntent)
    }

    pendingMassStorageDispatch = dispatch
    massStorageHandler.postDelayed(dispatch, MASS_STORAGE_MOUNT_GRACE_MS)
  }

  companion object {
    private const val MASS_STORAGE_MOUNT_GRACE_MS = 1_200L
  }
}
