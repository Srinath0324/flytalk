import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const receipt=JSON.parse(await readFile(path.join(root,'web/public/models/fly/source-receipt.json'),'utf8'));
const destination=path.join(root,'.research-tools/flybody-source');
const sourcePaths={
  'drosophila.blend':'flybody/fruitfly/assets/blender_model/drosophila.blend',
  'fruitfly.xml':'flybody/fruitfly/assets/fruitfly.xml',
  'LICENSE':'LICENSE',
};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(destination,{recursive:true});
for(const entry of receipt.files) {
  if(!Object.hasOwn(sourcePaths,entry.path))throw new Error(`Unexpected source file: ${entry.path}`);
  const output=path.join(destination,entry.path);
  const existing=await readFile(output).catch(()=>null);
  if(existing&&digest(existing)===entry.sha256){console.log(`Verified cached ${entry.path}`);continue;}
  const url=`https://raw.githubusercontent.com/TuragaLab/flybody/${receipt.revision}/${sourcePaths[entry.path]}`;
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Source download failed (${response.status}): ${url}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error(`Source integrity failure: ${entry.path}`);
  await writeFile(output,bytes);console.log(`Verified and saved ${entry.path}`);
}
