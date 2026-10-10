package io.github.kaminarios.whip.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PointF
import android.net.Uri
import com.davemorrissey.labs.subscaleview.ImageSource
import com.davemorrissey.labs.subscaleview.SubsamplingScaleImageView
import com.davemorrissey.labs.subscaleview.decoder.CompatDecoderFactory
import com.davemorrissey.labs.subscaleview.decoder.SkiaImageDecoder
import com.davemorrissey.labs.subscaleview.decoder.SkiaImageRegionDecoder
import kotlin.math.max
import kotlin.math.min

/** Scale is measured in physical display pixels per original image pixel. */
class WhipTiledImageView(context: Context) : SubsamplingScaleImageView(context) {
  private var sourceUri: String? = null
  private var loaded = false
  private var fitScale = 1f
  var onInfo: ((Int, Int) -> Unit)? = null
  var onFailure: (() -> Unit)? = null

  init {
    // Keep every color channel and load 1:1 tiles even on high-density phones.
    setBitmapDecoderFactory(CompatDecoderFactory(SkiaImageDecoder::class.java, Bitmap.Config.ARGB_8888))
    setRegionDecoderFactory(CompatDecoderFactory(SkiaImageRegionDecoder::class.java, Bitmap.Config.ARGB_8888))
    setMinimumTileDpi(0)
    setMaxTileSize(1024)
    setMinimumScaleType(SCALE_TYPE_CUSTOM)
    setOrientation(ORIENTATION_USE_EXIF)
    setOnImageEventListener(object : DefaultOnImageEventListener() {
      override fun onReady() {
        configureZoom(true)
        val rotated = appliedOrientation == 90 || appliedOrientation == 270
        onInfo?.invoke(if (rotated) sHeight else sWidth, if (rotated) sWidth else sHeight)
      }
      override fun onImageLoadError(error: Exception) { onFailure?.invoke() }
      override fun onTileLoadError(error: Exception) { onFailure?.invoke() }
    })
  }

  fun setSource(value: String) {
    if (sourceUri == value) return
    sourceUri = value
    recycle()
    loaded = false
    if (isAttachedToWindow) loadSource()
  }

  private fun loadSource() {
    val value = sourceUri ?: return
    if (loaded) return
    // Previews consume the already downloaded local original, never a web URL.
    val uri = Uri.parse(value)
    if (uri.scheme != "file" && uri.scheme != "content") {
      onFailure?.invoke()
      return
    }
    loaded = true
    setMinScale(0f)
    setImage(ImageSource.uri(uri).tilingEnabled())
  }

  fun zoomTo(command: String) {
    if (!isReady) return
    val target = if (command.startsWith("actual:")) 1f else fitScale
    val targetCenter = if (command.startsWith("actual:")) center else null
    animateScaleAndCenter(target, targetCenter ?: imageCenter())?.withDuration(180)?.start()
  }

  private fun imageCenter(): PointF {
    val rotated = appliedOrientation == 90 || appliedOrientation == 270
    return PointF((if (rotated) sHeight else sWidth) / 2f, (if (rotated) sWidth else sHeight) / 2f)
  }

  private fun configureZoom(reset: Boolean) {
    if (sWidth <= 0 || sHeight <= 0 || width <= 0 || height <= 0) return
    val wasFit = kotlin.math.abs(scale - fitScale) < 0.01f
    val size = imageCenter()
    fitScale = min(width / (size.x * 2), height / (size.y * 2))
    setMinScale(min(1f, fitScale))
    setMaxScale(max(4f, fitScale * 5f))
    setDoubleTapZoomScale(max(1f, fitScale * 2.5f))
    if (reset || wasFit) setScaleAndCenter(fitScale, size)
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (isReady) configureZoom(false)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    loadSource()
  }

  override fun onDetachedFromWindow() {
    recycle()
    loaded = false
    super.onDetachedFromWindow()
  }
}
