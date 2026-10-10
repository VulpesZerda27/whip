package io.github.kaminarios.whip

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.Rect
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.davemorrissey.labs.subscaleview.ImageSource
import com.davemorrissey.labs.subscaleview.decoder.ImageRegionDecoder
import com.davemorrissey.labs.subscaleview.decoder.SkiaImageRegionDecoder
import io.github.kaminarios.whip.image.WhipTiledImageView
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.ConcurrentLinkedQueue

@RunWith(AndroidJUnit4::class)
class TiledImagePreviewTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  @Test fun zoomLoadsOriginalPixelsInsteadOfEnlargingTheFitPreview() {
    val file = File.createTempFile("image-resolution-test-", ".png", instrumentation.targetContext.cacheDir)
    // The image is 15 times wider than the viewport: the old fixed 5x zoom could
    // not reach 1:1, and fitting it destroys the one-pixel black/white stripes.
    val original = Bitmap.createBitmap(12000, 512, Bitmap.Config.ARGB_8888)
    original.eraseColor(Color.WHITE)
    val sourceCanvas = Canvas(original)
    val paint = Paint().apply { color = Color.BLACK }
    for (x in 0 until original.width step 2) sourceCanvas.drawRect(x.toFloat(), 0f, x + 1f, 512f, paint)
    file.outputStream().use { original.compress(Bitmap.CompressFormat.PNG, 100, it) }
    original.recycle()

    val samples = ConcurrentLinkedQueue<Int>()
    val tileSizes = ConcurrentLinkedQueue<Point>()
    val frame = Bitmap.createBitmap(800, 600, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(frame)
    lateinit var view: WhipTiledImageView
    var dimensions: Pair<Int, Int>? = null
    var failed = false
    instrumentation.runOnMainSync {
      view = WhipTiledImageView(instrumentation.targetContext)
      view.onInfo = { width, height -> dimensions = width to height }
      view.onFailure = { failed = true }
      view.setRegionDecoderFactory {
        object : ImageRegionDecoder {
          val decoder = SkiaImageRegionDecoder(Bitmap.Config.ARGB_8888)
          override fun init(context: Context, uri: Uri): Point = decoder.init(context, uri)
          override fun isReady() = decoder.isReady
          override fun recycle() = decoder.recycle()
          override fun decodeRegion(rect: Rect, sample: Int): Bitmap = decoder.decodeRegion(rect, sample).also {
            samples.add(sample)
            tileSizes.add(Point(it.width, it.height))
          }
        }
      }
      view.layout(0, 0, 800, 600)
      view.setImage(ImageSource.uri(Uri.fromFile(file)).tilingEnabled())
    }

    fun awaitFrame(description: String, condition: () -> Boolean) {
      val deadline = System.nanoTime() + 15_000_000_000L
      while (System.nanoTime() < deadline) {
        var done = false
        instrumentation.runOnMainSync {
          frame.eraseColor(Color.TRANSPARENT)
          view.draw(canvas)
          assertFalse("Image decoding failed", failed)
          done = condition()
        }
        if (done) return
        Thread.sleep(25)
      }
      fail("Timed out: $description")
    }

    try {
      awaitFrame("fit preview") { view.isReady && view.scale < 0.1f }
      assertEquals(12000 to 512, dimensions)
      assertTrue(samples.any { it > 1 })
      instrumentation.runOnMainSync { view.zoomTo("actual:1") }
      awaitFrame("original pixels at 1:1") {
        kotlin.math.abs(view.scale - 1f) < 0.001f && (100 until 700).all { x ->
          frame.getPixel(x, 300) == if (x % 2 == 0) Color.BLACK else Color.WHITE
        }
      }
      assertTrue("Must decode full resolution tiles", samples.contains(1))
      assertTrue("Each decoded tile stays bounded", tileSizes.all { it.x <= 1024 && it.y <= 1024 })
      instrumentation.runOnMainSync { view.zoomTo("fit:2") }
      awaitFrame("fit after original size") { view.scale < 0.1f }
    } finally {
      instrumentation.runOnMainSync { view.recycle() }
      frame.recycle()
      file.delete()
    }
  }
}
