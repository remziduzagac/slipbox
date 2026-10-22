// Lays out a contact sheet of the Kyoto selects (exports/kyoto-selects.tsv) for printing.
import Foundation

protocol Sheet {
    var columns: Int { get }
    func place(_ index: Int) -> (row: Int, column: Int)
}

struct ContactSheet: Sheet {
    let columns: Int

    func place(_ index: Int) -> (row: Int, column: Int) {
        (index / columns, index % columns)
    }
}

extension ContactSheet {
    /* How many rows a sheet of n photographs takes:
       the last row may be short. */
    func rows(for count: Int) -> Int {
        (count + columns - 1) / columns
    }
}

actor PrintQueue {
    private var pending: [URL] = []

    func add(_ url: URL) {
        pending.append(url)
    }
}
