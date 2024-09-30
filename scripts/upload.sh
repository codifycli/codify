npm run pkg
oclif pack tarballs -r . -t darwin-arm64,darwin-x64
oclif upload macos
oclif upload tarballs -t darwin-arm64,darwin-x64
