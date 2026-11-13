fn compose(first, second) {
  return fn(value) { return second(first(value)); };
}
fn affine(factor, offset) {
  return fn(value) { return value * factor + offset; };
}
fn map(values, transform) {
  let i = 0;
  let result = [];
  while i < len(values) {
    result = push(result, transform(at(values, i)));
    i = i + 1;
  }
  return result;
}
let normalize = compose(affine(3, -2), affine(2, 7));
print map([-3, 0, 4, 9], normalize);
