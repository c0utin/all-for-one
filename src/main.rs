fn main() {
    // Define the table data
    let table = vec![
        vec![":0", "Algorithms", "Math", "Math", "Algorithms", "Math"],
        vec![":)", "Rust", "Rust", "Rust", "Rust", "Rust"],
        vec!["Read", "Algorithms", "Rust", "Algorithms", "Algorithms", "X"],
    ];

    // Print the table header
    println!("| {:<6} | {:<10} | {:<4} | {:<10} | {:<10} | {:<4} |", "X", "M", "T", "W", "T", "F");
    println!("| {:<6} | {:<10} | {:<4} | {:<10} | {:<10} | {:<4} |", "------", "------------", "------", "------------", "------------", "------");

    // Print the formatted table
    for row in &table {
        println!("| {:<6} | {:<10} | {:<4} | {:<10} | {:<10} | {:<4} |", row[0], row[1], row[2], row[3], row[4], row[5]);
    }
}

