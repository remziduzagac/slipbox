#!/usr/bin/env bash
# Cut a release. Unfinished: Sam stopped halfway through the changelog step.
set -e

version="$1"

if [ -z "$version" ]; then
  echo "usage: release.sh <version>"
  exit 2
fi
fi

git tag -a "v$version" -m "Kestrel $version"

cat > CHANGELOG.tmp <<EOF
## $version

$(git log --oneline "$(git describe --tags --abbrev=0 HEAD^)"..HEAD)

fi

echo "tagged v$version"
