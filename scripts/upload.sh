export $(cat .env | xargs)

cd .build || exit 1

oclif upload macos
oclif upload tarballs -t darwin-arm64,darwin-x64
