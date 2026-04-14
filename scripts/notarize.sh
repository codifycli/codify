#!/bin/bash
for filename in ./.build/dist/macos/*.pkg; do
  echo "Uploading and notarizing $filename with Apple... (5-10 minutes)"
  RESULT=$(
    xcrun notarytool submit $filename \
    --keychain-profile "notary-tool" \
    --wait \
    -f json
  )

  echo "Nortary tool submit completed with result:"
  echo $RESULT

  SUBMISSION_ID=$(jq -r '.id' <<< $RESULT)
  xcrun notarytool log $SUBMISSION_ID --keychain-profile "notary-tool"

  echo "Stapling notary to $filename"
  xcrun stapler staple $filename
  echo "Done stapling"
done

