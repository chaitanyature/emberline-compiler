fn count_down(n, acc) {
  if n == 0 { return acc; }
  return count_down(n - 1, acc + 1);
}
print count_down(100000, 0);
