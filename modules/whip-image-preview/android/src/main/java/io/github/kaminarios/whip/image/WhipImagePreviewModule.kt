package io.github.kaminarios.whip.image

import android.content.Context
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class WhipImagePreviewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WhipImagePreview")
    View(WhipImagePreviewView::class) {
      Events("onImageInfo", "onImageError")
      Prop("uri") { view: WhipImagePreviewView, uri: String -> view.image.setSource(uri) }
      Prop("zoomCommand") { view: WhipImagePreviewView, command: String -> view.image.zoomTo(command) }
    }
  }
}

class WhipImagePreviewView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onImageInfo by EventDispatcher()
  private val onImageError by EventDispatcher()
  val image = WhipTiledImageView(context)

  init {
    image.onInfo = { width, height -> onImageInfo(mapOf("width" to width, "height" to height)) }
    image.onFailure = { onImageError(emptyMap<String, String>()) }
    addView(image, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    image.layout(0, 0, right - left, bottom - top)
  }
}
