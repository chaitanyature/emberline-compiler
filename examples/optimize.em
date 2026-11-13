// Constant false exits and constant arithmetic can disappear, while the
// accumulator and the captured function argument remain runtime values.
fn checksum(limit) {
  let i = 0;
  let total = 0;
  while i < limit {
    if false { print "unreachable"; }
    total = (total + (3 * 7 + 4) * i) % 997;
    i = i + 1;
  }
  return total;
}
print checksum(1000);
