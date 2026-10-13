import ExpoModulesCore
import UIKit

public final class WhipAgentSpinnerView: ExpoView {
  private static let animationKey = "whip-agent-spinner-rotation"
  private static let strokeRatio: CGFloat = 2 / 16
  private static let trackOpacity: CGFloat = 0.22
  private static let arcSweep = CGFloat.pi / 2

  private let spinnerLayer = CALayer()
  private let trackLayer = CAShapeLayer()
  private let arcLayer = CAShapeLayer()
  private var animationEnabled = true
  private var rotationDuration = 0.7
  private var framesPerSecond: Float = 30
  private var spinnerColor = UIColor.white

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    isUserInteractionEnabled = false
    layer.addSublayer(spinnerLayer)
    for shape in [trackLayer, arcLayer] {
      shape.fillColor = UIColor.clear.cgColor
      shape.lineCap = .round
      spinnerLayer.addSublayer(shape)
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    spinnerLayer.frame = bounds
    layoutRing()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    updateAnimationState()
  }

  public func setSpinnerColor(_ color: UIColor) {
    spinnerColor = color
    updateRingColors()
  }

  public func setRotationDuration(_ durationMs: Double) {
    let nextDuration = max(durationMs, 100) / 1000
    guard rotationDuration != nextDuration else { return }
    rotationDuration = nextDuration
    if spinnerLayer.animation(forKey: Self.animationKey) != nil {
      startAnimation()
    }
  }

  public func setAnimationEnabled(_ enabled: Bool) {
    guard animationEnabled != enabled else { return }
    animationEnabled = enabled
    updateAnimationState()
  }

  public func setFramesPerSecond(_ value: Float) {
    let nextFrameRate = min(max(value, 1), 120)
    guard framesPerSecond != nextFrameRate else { return }
    framesPerSecond = nextFrameRate
    if spinnerLayer.animation(forKey: Self.animationKey) != nil {
      startAnimation()
    }
  }

  private func layoutRing() {
    let extent = min(bounds.width, bounds.height)
    guard extent > 0 else { return }

    // Nightfall ring: a faint full track with one rotating quarter arc.
    let lineWidth = extent * Self.strokeRatio
    let center = CGPoint(x: bounds.midX, y: bounds.midY)
    let radius = (extent - lineWidth) / 2
    trackLayer.path = UIBezierPath(
      arcCenter: center, radius: radius, startAngle: 0, endAngle: 2 * CGFloat.pi, clockwise: true
    ).cgPath
    arcLayer.path = UIBezierPath(
      arcCenter: center,
      radius: radius,
      startAngle: -CGFloat.pi / 2 - Self.arcSweep / 2,
      endAngle: -CGFloat.pi / 2 + Self.arcSweep / 2,
      clockwise: true
    ).cgPath
    trackLayer.lineWidth = lineWidth
    arcLayer.lineWidth = lineWidth
    updateRingColors()
  }

  private func updateRingColors() {
    trackLayer.strokeColor = spinnerColor.withAlphaComponent(Self.trackOpacity).cgColor
    arcLayer.strokeColor = spinnerColor.cgColor
  }

  private func updateAnimationState() {
    if animationEnabled && window != nil {
      if spinnerLayer.animation(forKey: Self.animationKey) == nil {
        startAnimation()
      }
    } else {
      stopAnimation()
    }
  }

  private func startAnimation() {
    spinnerLayer.removeAnimation(forKey: Self.animationKey)
    let animation = CABasicAnimation(keyPath: "transform.rotation.z")
    animation.fromValue = 0
    animation.toValue = CGFloat.pi * 2
    animation.duration = rotationDuration
    animation.preferredFrameRateRange = CAFrameRateRange(
      minimum: framesPerSecond,
      maximum: framesPerSecond,
      preferred: framesPerSecond
    )
    animation.repeatCount = .infinity
    animation.timingFunction = CAMediaTimingFunction(name: .linear)
    animation.isRemovedOnCompletion = false
    spinnerLayer.add(animation, forKey: Self.animationKey)
  }

  private func stopAnimation() {
    spinnerLayer.removeAnimation(forKey: Self.animationKey)
    spinnerLayer.transform = CATransform3DIdentity
  }
}
