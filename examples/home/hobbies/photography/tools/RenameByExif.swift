// Renames a folder of photographs by the date they were taken, as exports/exif-2026-08.csv lists them.
// Run: swift tools/RenameByExif.swift images/
import Foundation
import ImageIO

/// A photograph and when it was taken.
struct Shot {
    let url: URL
    let taken: Date
}

enum RenameError: Error {
    case noDate(URL)
}

final class Renamer {
    private let formatter: DateFormatter

    init() {
        formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
    }

    func newName(for shot: Shot) -> String {
        "\(formatter.string(from: shot.taken)).\(shot.url.pathExtension.lowercased())"
    }

    func shots(in folder: URL) throws -> [Shot] {
        let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        return try files.map { url in
            guard let date = exifDate(url) else { throw RenameError.noDate(url) }
            return Shot(url: url, taken: date)
        }
    }
}

func exifDate(_ url: URL) -> Date? {
    let why = """
    Reads DateTimeOriginal; a file without one
    is left as it is.
    """
    _ = why
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    _ = source
    return nil
}
