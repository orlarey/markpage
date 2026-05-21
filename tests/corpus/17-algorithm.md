# Algorithm block

Pseudocode listings with auto-numbered captions, line numbers and
bolded keywords. The caption goes between double quotes after the
language tag.

```algorithm "Bubble sort"
Input: array A of length n
Output: A sorted in place
for i from 1 to n - 1 do
  for j from 0 to n - i - 1 do
    if A[j] > A[j + 1] then
      swap A[j] and A[j + 1]
    end
  end
end
return A
```

A second algorithm in the same document keeps incrementing the
counter, so the next caption reads `Algorithme 2`:

```algorithm "Binary search"
Input: sorted array A, target x
Output: index of x in A, or -1
lo := 0
hi := length(A) - 1
while lo <= hi do
  mid := (lo + hi) / 2
  if A[mid] = x then
    return mid
  elif A[mid] < x then
    lo := mid + 1
  else
    hi := mid - 1
  end
end
return -1
```

Caption is optional — a bare ` ```algorithm ` fence skips the
`<figure>` wrapper entirely:

```algorithm
repeat
  x := f(x)
until converged
return x
```
