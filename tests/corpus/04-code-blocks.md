# Code blocks

Python (in the listings whitelist — `language=Python` should be set):

```python
def greet(name):
    return f"Hello, {name}!"
```

C++ (aliased — should resolve to `language=C++`):

```cpp
int main() { return 0; }
```

Unknown fence language (must not emit `language=` — keeps the doc compilable):

```weirdlang
some weird syntax %% && @@
```

No language specified:

```
plain code block
```

Code with UTF-8 (xelatex handles it natively):

```python
nom = "café"
α, β = 1.5, 2.5
```
