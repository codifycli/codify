if command -v codify >/dev/null 2>&1; then
  echo "Codify is already installed, skipping."
else
  curl -fsSL https://releases.codifycli.com/install.sh | bash
fi
