#!/bin/sh

set -eu

: "${SRCROOT:?Xcode did not provide SRCROOT}"
: "${TARGET_BUILD_DIR:?Xcode did not provide TARGET_BUILD_DIR}"
: "${UNLOCALIZED_RESOURCES_FOLDER_PATH:?Xcode did not provide UNLOCALIZED_RESOURCES_FOLDER_PATH}"
: "${DERIVED_FILE_DIR:?Xcode did not provide DERIVED_FILE_DIR}"

REPOSITORY_ROOT="$(cd "$SRCROOT/../.." && pwd)"
DESTINATION_PARENT="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
DESTINATION="$DESTINATION_PARENT/BlackboxWeb"
STAGING="$DERIVED_FILE_DIR/BlackboxWeb.staging"

case "$DESTINATION" in
  "$TARGET_BUILD_DIR"/*/BlackboxWeb) ;;
  *)
    echo "error: Refusing unsafe BlackboxWeb destination: $DESTINATION" >&2
    exit 1
    ;;
esac

case "$STAGING" in
  "$DERIVED_FILE_DIR"/BlackboxWeb.staging) ;;
  *)
    echo "error: Refusing unsafe BlackboxWeb staging path: $STAGING" >&2
    exit 1
    ;;
esac

if [ ! -f "$REPOSITORY_ROOT/node_modules/bootstrap/dist/css/bootstrap.min.css" ]; then
  echo "error: Blackbox web dependencies are missing." >&2
  echo "error: Run 'yarn install' or 'npm install' in $REPOSITORY_ROOT before building iOS." >&2
  exit 1
fi

REQUIRED_PATHS="
index.html
index.js
changelog.html
LICENSE
NOTICE.md
THIRD_PARTY_NOTICES.md
legal
css
images
js
_locales
resources
node_modules/bootstrap
node_modules/html2canvas
node_modules/lodash
node_modules/webm-writer
"

for relative_path in $REQUIRED_PATHS; do
  if [ ! -e "$REPOSITORY_ROOT/$relative_path" ]; then
    echo "error: Missing required Blackbox viewer asset: $relative_path" >&2
    exit 1
  fi
done

/bin/rm -rf "$STAGING"
/bin/mkdir -p "$STAGING"

copy_path() {
  relative_path="$1"
  source_path="$REPOSITORY_ROOT/$relative_path"
  destination_path="$STAGING/$relative_path"

  /bin/mkdir -p "$(/usr/bin/dirname "$destination_path")"
  /usr/bin/ditto "$source_path" "$destination_path"
}

for relative_path in $REQUIRED_PATHS; do
  copy_path "$relative_path"
done

for relative_path in manifest.json locales; do
  if [ -e "$REPOSITORY_ROOT/$relative_path" ]; then
    copy_path "$relative_path"
  fi
done

if [ ! -f "$STAGING/index.html" ]; then
  echo "error: BlackboxWeb staging validation failed." >&2
  exit 1
fi

/bin/mkdir -p "$DESTINATION_PARENT"
/bin/rm -rf "$DESTINATION"
/bin/mv "$STAGING" "$DESTINATION"

echo "Synced Rotorflight viewer assets to $DESTINATION"
