import sys
def patch(path, pairs):
    s = open(path).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f'PATCH FAIL ({n} matches) in {path}:\n{old[:200]}')
        s = s.replace(old, new)
    open(path, 'w').write(s)
    print('patched', path, len(pairs))
