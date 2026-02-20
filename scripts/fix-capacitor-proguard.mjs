import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const targets = [
  "node_modules/@capacitor/android/capacitor/build.gradle",
  "node_modules/@capacitor/app/android/build.gradle",
  "node_modules/@capacitor/local-notifications/android/build.gradle",
  "node_modules/@capacitor/push-notifications/android/build.gradle",
  "node_modules/@capacitor-community/text-to-speech/android/build.gradle",
];

const from = "proguard-android.txt";
const to = "proguard-android-optimize.txt";

let updated = 0;

for (const relPath of targets) {
  const filePath = join(process.cwd(), relPath);
  if (!existsSync(filePath)) {
    continue;
  }

  const content = readFileSync(filePath, "utf8");
  if (!content.includes(from)) {
    continue;
  }

  writeFileSync(filePath, content.replaceAll(from, to), "utf8");
  updated += 1;
}

if (updated > 0) {
  console.log(`[fix-capacitor-proguard] Updated ${updated} Gradle file(s).`);
} else {
  console.log("[fix-capacitor-proguard] No changes needed.");
}
