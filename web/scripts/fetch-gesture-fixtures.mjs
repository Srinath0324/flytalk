// Public sample photographs referenced by the MediaPipe Authors' notebook:
// https://colab.research.google.com/github/googlesamples/mediapipe/blob/main/examples/gesture_recognizer/python/gesture_recognizer.ipynb
// Download for local QA only; these are not shipped in the application.
import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL(
  '../../.research-tools/gesture-fixtures/',
  import.meta.url,
);
await mkdir(directory, { recursive: true });
for (const name of ['thumbs_up', 'pointing_up', 'victory']) {
  const response = await fetch(
    `https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/${name}.jpg`,
  );
  if (!response.ok)
    throw new Error(`Could not fetch ${name}: ${response.status}`);
  await writeFile(
    new URL(`${name}.jpg`, directory),
    Buffer.from(await response.arrayBuffer()),
  );
  console.log(`Saved ${name}`);
}
