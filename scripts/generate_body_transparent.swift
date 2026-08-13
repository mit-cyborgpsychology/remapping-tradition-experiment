#!/usr/bin/env swift

import CoreImage
import CoreVideo
import Foundation
import ImageIO
import Vision

enum CutoutError: Error, CustomStringConvertible {
    case cannotLoad(URL)
    case noForeground(URL)

    var description: String {
        switch self {
        case .cannotLoad(let url):
            return "Could not load image: \(url.path)"
        case .noForeground(let url):
            return "No foreground instance found: \(url.path)"
        }
    }
}

let fileManager = FileManager.default
let context = CIContext(options: [
    .cacheIntermediates: false,
    .useSoftwareRenderer: false,
])
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

func loadCGImage(_ url: URL) throws -> CGImage {
    guard
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(
            source,
            0,
            [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
        )
    else {
        throw CutoutError.cannotLoad(url)
    }
    return image
}

func writePNG(_ image: CIImage, to outputURL: URL) throws {
    try context.writePNGRepresentation(
        of: image,
        to: outputURL,
        format: .RGBA8,
        colorSpace: colorSpace
    )
}

func averageMaskValue(_ image: CIImage) -> Double {
    let average = image.applyingFilter(
        "CIAreaAverage",
        parameters: [kCIInputExtentKey: CIVector(cgRect: image.extent)]
    )
    var pixel = [UInt8](repeating: 0, count: 4)
    context.render(
        average,
        toBitmap: &pixel,
        rowBytes: 4,
        bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
        format: .RGBA8,
        colorSpace: colorSpace
    )
    return Double(pixel[0]) / 255.0
}

func createCutout(inputURL: URL, outputURL: URL) throws {
    let image = try loadCGImage(inputURL)
    let sourceImage = CIImage(cgImage: image)
    let requestHandler = VNImageRequestHandler(cgImage: image, options: [:])
    let personRequest = VNGeneratePersonSegmentationRequest()
    let humanRequest = VNDetectHumanRectanglesRequest()
    humanRequest.upperBodyOnly = false
    personRequest.qualityLevel = .accurate
    personRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8
    try requestHandler.perform([personRequest, humanRequest])

    guard let personMaskBuffer = personRequest.results?.first?.pixelBuffer else {
        throw CutoutError.noForeground(inputURL)
    }
    let rawPersonMask = CIImage(cvPixelBuffer: personMaskBuffer)
    let personMask = rawPersonMask
        .transformed(
            by: CGAffineTransform(
                scaleX: sourceImage.extent.width / rawPersonMask.extent.width,
                y: sourceImage.extent.height / rawPersonMask.extent.height
            )
        )
        .cropped(to: sourceImage.extent)

    var mask = personMask
    let model = ProcessInfo.processInfo.environment["CUTOUT_MODEL"] ?? "hybrid"
    if model != "person" {
        let foregroundRequest = VNGenerateForegroundInstanceMaskRequest()
        try requestHandler.perform([foregroundRequest])
        if
            let observation = foregroundRequest.results?.first,
            !observation.allInstances.isEmpty
        {
            let foregroundMaskBuffer = try observation.generateScaledMaskForImage(
                forInstances: observation.allInstances,
                from: requestHandler
            )
            let foregroundMask = CIImage(cvPixelBuffer: foregroundMaskBuffer)
                .cropped(to: sourceImage.extent)
            if model == "foreground" {
                mask = foregroundMask
            } else {
                let personCoverage = averageMaskValue(personMask)
                let foregroundCoverage = averageMaskValue(foregroundMask)
                let coverageRatio = foregroundCoverage / max(personCoverage, 0.001)
                if ProcessInfo.processInfo.environment["CUTOUT_DEBUG"] == "1" {
                    print(
                        String(
                            format: "person=%.3f foreground=%.3f ratio=%.2f",
                            personCoverage,
                            foregroundCoverage,
                            coverageRatio
                        )
                    )
                }
                if coverageRatio <= 1.8 {
                    mask = foregroundMask
                } else {
                    let expandedPersonMask = personMask
                        .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: 24])
                        .cropped(to: sourceImage.extent)
                    let costumeMask = foregroundMask
                        .applyingFilter(
                            "CIMinimumCompositing",
                            parameters: [kCIInputBackgroundImageKey: expandedPersonMask]
                        )
                        .cropped(to: sourceImage.extent)
                    mask = personMask
                        .applyingFilter(
                            "CIMaximumCompositing",
                            parameters: [kCIInputBackgroundImageKey: costumeMask]
                        )
                        .cropped(to: sourceImage.extent)
                }
            }
        }
    }

    if let humanBounds = humanRequest.results?
        .map(\.boundingBox)
        .max(by: { $0.width * $0.height < $1.width * $1.height })
    {
        let imageWidth = sourceImage.extent.width
        let imageHeight = sourceImage.extent.height
        let detectedRect = CGRect(
            x: humanBounds.minX * imageWidth,
            y: humanBounds.minY * imageHeight,
            width: humanBounds.width * imageWidth,
            height: humanBounds.height * imageHeight
        )
        let horizontalPadding = max(detectedRect.width * 0.22, imageWidth * 0.035)
        let verticalPadding = max(detectedRect.height * 0.12, imageHeight * 0.025)
        let gateRect = detectedRect
            .insetBy(dx: -horizontalPadding, dy: -verticalPadding)
            .intersection(sourceImage.extent)
        let black = CIImage(color: .black).cropped(to: sourceImage.extent)
        let whiteGate = CIImage(color: .white).cropped(to: gateRect).composited(over: black)
        mask = mask
            .applyingFilter(
                "CIMinimumCompositing",
                parameters: [kCIInputBackgroundImageKey: whiteGate]
            )
            .cropped(to: sourceImage.extent)
        if ProcessInfo.processInfo.environment["CUTOUT_DEBUG"] == "1" {
            print("humanBounds=\(humanBounds) gate=\(gateRect)")
        }
    }

    let transparentBackground = CIImage(color: CIColor.clear).cropped(to: sourceImage.extent)
    let maskedImage = sourceImage.applyingFilter(
        "CIBlendWithMask",
        parameters: [
            kCIInputBackgroundImageKey: transparentBackground,
            kCIInputMaskImageKey: mask,
        ]
    )
    try fileManager.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    try writePNG(maskedImage, to: outputURL)
}

func bodyImages(in root: URL) throws -> [URL] {
    guard let enumerator = fileManager.enumerator(
        at: root,
        includingPropertiesForKeys: [.isRegularFileKey],
        options: [.skipsHiddenFiles]
    ) else {
        return []
    }
    return enumerator
        .compactMap { $0 as? URL }
        .filter { $0.lastPathComponent == "body.webp" }
        .sorted { $0.path < $1.path }
}

let arguments = CommandLine.arguments
guard arguments.count == 2 || arguments.count == 3 else {
    FileHandle.standardError.write(
        Data("Usage: generate_body_transparent.swift <pose-root> [single-body.webp]\n".utf8)
    )
    exit(2)
}

let rootURL = URL(fileURLWithPath: arguments[1], isDirectory: true)
let inputs: [URL]
if arguments.count == 3 {
    inputs = [URL(fileURLWithPath: arguments[2])]
} else {
    inputs = try bodyImages(in: rootURL)
}

var failures: [String] = []
for (index, inputURL) in inputs.enumerated() {
    autoreleasepool {
        let outputURL = inputURL.deletingLastPathComponent().appendingPathComponent("body-transparent.png")
        do {
            try createCutout(inputURL: inputURL, outputURL: outputURL)
            if (index + 1) % 10 == 0 || index + 1 == inputs.count {
                print("Processed \(index + 1)/\(inputs.count)")
            }
        } catch {
            failures.append("\(inputURL.path): \(error)")
        }
    }
}

if !failures.isEmpty {
    FileHandle.standardError.write(Data((failures.joined(separator: "\n") + "\n").utf8))
    exit(1)
}
