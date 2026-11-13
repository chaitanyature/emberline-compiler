// Compute rolling peak, sum and mean. Each channel owns independent cells.
fn channel(capacity) {
  let window = [];
  let cursor = 0;
  let total = 0;
  fn sample(value) {
    if len(window) < capacity {
      window = push(window, value);
    } else {
      total = total - at(window, cursor);
      window = set_at(window, cursor, value);
    }
    cursor = (cursor + 1) % capacity;
    total = total + value;
    let best = at(window, 0);
    let i = 1;
    while i < len(window) {
      let point = at(window, i);
      if point > best { best = point; }
      i = i + 1;
    }
    return [total, total / len(window), best];
  }
  return sample;
}
let port = channel(3);
let sea = channel(2);
let samples = [["port", 12], ["sea", 40], ["port", 9], ["sea", 28],
               ["port", 18], ["port", 21], ["sea", 14]];
let i = 0;
while i < len(samples) {
  let row = at(samples, i);
  let site = at(row, 0);
  let reducer = port;
  if site == "sea" { reducer = sea; }
  print site + " " + str(reducer(at(row, 1)));
  i = i + 1;
}
