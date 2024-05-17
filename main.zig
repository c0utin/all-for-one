const std = @import("std");

fn printLine(cols: []const []const u8, colWidths: []const usize) void {
    var col_index: usize = 0;
    while (col_index < cols.len) {
        const col = cols[col_index];
        const colWidth = colWidths[col_index];
        std.debug.print("| {s} ", .{col});

        var space_count = colWidth - col.len;
        while (space_count > 0) {
            std.debug.print(" ", .{});
            space_count -= 1;
        }

        col_index += 1;
    }
    std.debug.print("|\n", .{});
}

fn printSeparator(colWidths: []const usize) void {
    var width_index: usize = 0;
    while (width_index < colWidths.len) {
        const width = colWidths[width_index];
        std.debug.print("|", .{});

        var dash_count = width + 2;
        while (dash_count > 0) {
            std.debug.print("-", .{});
            dash_count -= 1;
        }

        width_index += 1;
    }
    std.debug.print("|\n", .{});
}

pub fn main() void {
    const headers = [_][]const u8{ "M", "T", "W", "T", "F" };
    const rows = [_][]const u8{
        "Algorithms", "Math",    "Algorithms", "Math",    "Networks",
        "Zigging",    "Zigging", "Zigging",    "Zigging", "Zigging",
    };

    var colWidths = [_]usize{ 0, 0, 0, 0, 0 };

    var header_index: usize = 0;
    while (header_index < headers.len) {
        colWidths[header_index] = headers[header_index].len;
        header_index += 1;
    }

    var row_index: usize = 0;
    while (row_index < rows.len) {
        const colWidthIndex = row_index % headers.len;
        const row = rows[row_index];
        if (row.len > colWidths[colWidthIndex]) {
            colWidths[colWidthIndex] = row.len;
        }
        row_index += 1;
    }

    printLine(headers[0..], colWidths[0..]);
    printSeparator(colWidths[0..]);

    var i: usize = 0;
    while (i < rows.len) : (i += headers.len) {
        printLine(rows[i .. i + headers.len], colWidths[0..]);
    }
}
