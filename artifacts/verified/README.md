# Local verified installer copies

Copy a tagged `SaVaGe_<version>_x64-setup.exe` here only if you need it on this
machine. Git ignores `*.exe`. Keep `SHA256SUMS.txt` and `provenance.json` from
the same tag. The append-only catalog is
`docs/engineering/verified-installers.json`. Record with:

```powershell
npx --yes pnpm@10.17.1 release:retain -- record --installer path\to\SaVaGe_0.1.0_x64-setup.exe
```

Do not delete earlier rows when adding a newer tag. GitHub Releases for older
tags remain the shared archive.
