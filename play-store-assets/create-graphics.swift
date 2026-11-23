import AppKit

func color(_ hex: UInt32, alpha: CGFloat = 1) -> NSColor {
    NSColor(
        calibratedRed: CGFloat((hex >> 16) & 0xFF) / 255,
        green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue: CGFloat(hex & 0xFF) / 255,
        alpha: alpha
    )
}

func text(_ value: String, x: CGFloat, y: CGFloat, size: CGFloat, font: String, fill: NSColor) {
    let style: [NSAttributedString.Key: Any] = [
        .font: NSFont(name: font, size: size) ?? NSFont.systemFont(ofSize: size),
        .foregroundColor: fill
    ]
    (value as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: style)
}

func line(from start: NSPoint, to end: NSPoint, stroke: NSColor, width: CGFloat = 2) {
    let path = NSBezierPath()
    path.move(to: start)
    path.line(to: end)
    path.lineWidth = width
    stroke.setStroke()
    path.stroke()
}

func circle(_ rect: NSRect, stroke: NSColor, width: CGFloat = 2, fill: NSColor? = nil) {
    let path = NSBezierPath(ovalIn: rect)
    path.lineWidth = width
    if let fill {
        fill.setFill()
        path.fill()
    }
    stroke.setStroke()
    path.stroke()
}

func sparkle(center: NSPoint, radius: CGFloat, stroke: NSColor, width: CGFloat = 2) {
    line(from: NSPoint(x: center.x, y: center.y - radius), to: NSPoint(x: center.x, y: center.y + radius), stroke: stroke, width: width)
    line(from: NSPoint(x: center.x - radius, y: center.y), to: NSPoint(x: center.x + radius, y: center.y), stroke: stroke, width: width)
    line(from: NSPoint(x: center.x - radius * 0.58, y: center.y - radius * 0.58), to: NSPoint(x: center.x + radius * 0.58, y: center.y + radius * 0.58), stroke: stroke, width: width * 0.65)
    line(from: NSPoint(x: center.x - radius * 0.58, y: center.y + radius * 0.58), to: NSPoint(x: center.x + radius * 0.58, y: center.y - radius * 0.58), stroke: stroke, width: width * 0.65)
}

func renderPNG(width: Int, height: Int, path: String, draw: () -> Void) {
    let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    draw()
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    try! bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

func drawIcon() {
    let size = 512
    renderPNG(width: size, height: size, path: "play-store-assets/app-icon-512.png") {
        let bounds = NSRect(x: 0, y: 0, width: size, height: size)
        let bg = NSBezierPath(rect: bounds)
        let gradient = NSGradient(starting: color(0x302744), ending: color(0x6550B5))!
        gradient.draw(in: bg, angle: -45)

        circle(NSRect(x: 87, y: 87, width: 338, height: 338), stroke: color(0xEACB82, alpha: 0.45), width: 2)
        circle(NSRect(x: 112, y: 112, width: 288, height: 288), stroke: color(0xF5E8C8, alpha: 0.86), width: 3)
        circle(NSRect(x: 151, y: 151, width: 210, height: 210), stroke: color(0xEACB82), width: 3)

        for angle in stride(from: 0.0, to: 360.0, by: 30.0) {
            let radians = angle * .pi / 180
            let inner = NSPoint(x: 256 + cos(radians) * 146, y: 256 + sin(radians) * 146)
            let outer = NSPoint(x: 256 + cos(radians) * 164, y: 256 + sin(radians) * 164)
            line(from: inner, to: outer, stroke: color(0xF5E8C8, alpha: 0.85), width: 3)
        }

        circle(NSRect(x: 222, y: 222, width: 68, height: 68), stroke: color(0xF4D887), width: 4, fill: color(0xEACB82))
        sparkle(center: NSPoint(x: 256, y: 256), radius: 25, stroke: color(0x4A3A6B), width: 4)
        sparkle(center: NSPoint(x: 178, y: 334), radius: 17, stroke: color(0xFFF7E9), width: 3)
        sparkle(center: NSPoint(x: 350, y: 184), radius: 13, stroke: color(0xF4D887), width: 3)
        circle(NSRect(x: 162, y: 176, width: 6, height: 6), stroke: color(0xFFF7E9), fill: color(0xFFF7E9))
        circle(NSRect(x: 337, y: 329, width: 7, height: 7), stroke: color(0xF4D887), fill: color(0xF4D887))
    }
}

func drawFeatureGraphic() {
    let width: CGFloat = 1024
    let height: CGFloat = 500
    renderPNG(width: Int(width), height: Int(height), path: "play-store-assets/feature-graphic-1024x500.png") {

        let bg = NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height))
        NSGradient(starting: color(0xFFF9F0), ending: color(0xF0EDFA))!.draw(in: bg, angle: 0)

        let orb = NSBezierPath(ovalIn: NSRect(x: 618, y: -108, width: 520, height: 620))
        NSGradient(starting: color(0x302744), ending: color(0x6550B5))!.draw(in: orb, angle: -45)

        text("ASTROJYOTISH", x: 70, y: 389, size: 23, font: "Arial-BoldMT", fill: color(0x9A6A25))
        text("Find your", x: 67, y: 287, size: 65, font: "Georgia-Bold", fill: color(0x302744))
        text("cosmic clarity.", x: 67, y: 214, size: 65, font: "Georgia-Bold", fill: color(0x302744))
        text("Kundli charts  ·  Daily Panchang", x: 72, y: 151, size: 24, font: "Arial", fill: color(0x777487))
        text("Astrology for reflection", x: 72, y: 112, size: 22, font: "Arial", fill: color(0x777487))

        let center = NSPoint(x: 816, y: 245)
        circle(NSRect(x: center.x - 164, y: center.y - 164, width: 328, height: 328), stroke: color(0xF5E8C8, alpha: 0.4), width: 2)
        circle(NSRect(x: center.x - 132, y: center.y - 132, width: 264, height: 264), stroke: color(0xFFF7E9, alpha: 0.9), width: 3)
        circle(NSRect(x: center.x - 91, y: center.y - 91, width: 182, height: 182), stroke: color(0xEACB82), width: 3)
        circle(NSRect(x: center.x - 39, y: center.y - 39, width: 78, height: 78), stroke: color(0xF4D887), width: 3, fill: color(0xEACB82))
        sparkle(center: center, radius: 29, stroke: color(0x4A3A6B), width: 4)

        for index in 0..<12 {
            let angle = Double(index) * .pi / 6
            let inner = NSPoint(x: center.x + cos(angle) * 138, y: center.y + sin(angle) * 138)
            let outer = NSPoint(x: center.x + cos(angle) * 156, y: center.y + sin(angle) * 156)
            line(from: inner, to: outer, stroke: color(0xFFF7E9), width: 3)
        }

        sparkle(center: NSPoint(x: 702, y: 354), radius: 18, stroke: color(0xF4D887), width: 3)
        sparkle(center: NSPoint(x: 914, y: 132), radius: 14, stroke: color(0xFFF7E9), width: 3)
        circle(NSRect(x: 893, y: 358, width: 8, height: 8), stroke: color(0xEACB82), fill: color(0xEACB82))
    }
}

drawIcon()
drawFeatureGraphic()
