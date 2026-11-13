#!/usr/bin/env bash
# Builds a self-hosted F-Droid repository from the signed APK and publishes it to the gh-pages branch.
# Needs: fdroidserver, the Android SDK build-tools, git. Env: GH_TOKEN, REPO, RUN, APK, ANDROID_HOME.
set -euo pipefail
ROOT=$(pwd)
APPID=com.coachleonidas.mealcost
BASE="https://${REPO%%/*}.github.io/${REPO##*/}"
URL="$BASE/fdroid/repo"
W="$RUNNER_TEMP/fd"; PAGES="$RUNNER_TEMP/pages"
rm -rf "$W" "$PAGES"; mkdir -p "$W/repo" "$W/metadata"

# Previous APKs (kept so people can roll back)
if git clone --quiet --depth 1 --branch gh-pages "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" "$PAGES" 2>/dev/null; then
  cp "$PAGES"/fdroid/repo/*.apk "$W/repo/" 2>/dev/null || true
fi
cp "$APK" "$W/repo/${APPID}_${RUN}.apk"
ls -t "$W"/repo/*.apk | tail -n +4 | xargs -r rm -f

cp -r fdroid/metadata/* "$W/metadata/"
KS="$HOME/.mealcost-ci/fdroid.keystore"
[ -f "$KS" ] && cp "$KS" "$W/keystore.p12" || echo "No cached repo key, a new one is created"
cat > "$W/config.yml" <<C
sdk_path: $ANDROID_HOME
repo_url: $URL
repo_name: Coach Leonidas apps
repo_description: Apps by Coach Leonidas. Free and open source.
repo_icon: icon.png
archive_older: 0
repo_keyalias: mealcost-repo
keystore: keystore.p12
keystorepass: mealcost-fdroid
keypass: mealcost-fdroid
keydname: CN=Coach Leonidas apps, O=Coach Leonidas, C=CZ
make_current_version_link: false
C
cp public/icon-512.png "$W/icon.png"; mkdir -p "$W/repo/icons"; cp public/icon-512.png "$W/repo/icons/icon.png" || true
cd "$W"
chmod 600 config.yml
fdroid update --create-key --pretty || fdroid update --pretty
mkdir -p "$HOME/.mealcost-ci"; cp keystore.p12 "$KS"
FP=$(keytool -list -v -keystore keystore.p12 -storepass mealcost-fdroid -alias mealcost-repo 2>/dev/null | awk -F'SHA256: ' '/SHA256:/{print $2; exit}' | tr -d ':' | tr 'a-f' 'A-F')
echo "Repo fingerprint: $FP"

# Publish: a single fresh commit so the branch never grows
cd "$ROOT"
rm -rf "$PAGES"; mkdir -p "$PAGES/fdroid"
cp -r "$W/repo" "$PAGES/fdroid/repo"
rm -f "$PAGES/fdroid/repo/icons/icon.png" 2>/dev/null || true
touch "$PAGES/.nojekyll"
sed -e "s#__URL__#$URL#g" -e "s#__FP__#$FP#g" -e "s#__BASE__#$BASE#g" fdroid/index.html > "$PAGES/fdroid/index.html"
printf '<meta http-equiv="refresh" content="0; url=fdroid/">\n' > "$PAGES/index.html"
cd "$PAGES"
git init -q -b gh-pages
git config user.name "github-actions"; git config user.email "actions@users.noreply.github.com"
git add -A; git commit -qm "F-Droid repo build $RUN"
git remote add origin "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git"
git push -q --force origin gh-pages
echo "Published $URL"
