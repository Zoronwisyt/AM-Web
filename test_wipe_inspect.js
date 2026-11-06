const fs = require('fs');

const xmlText = fs.readFileSync('c:\\Users\\jeduc\\Downloads\\wipe-layers-5x-1080x1350 (4).xml', 'utf8');

// Check XML structure with DOMParser in Node
// We can use the browser simulator or JSDOM/regex to inspect
console.log('XML length:', xmlText.length);
const embedScenes = [...xmlText.matchAll(/<embedScene\b([^>]+)>([\s\S]*?)<\/embedScene>/g)];
console.log('Total embedScene elements:', embedScenes.length);
for (let i = 0; i < embedScenes.length; i++) {
  const [_, attrs, body] = embedScenes[i];
  const label = attrs.match(/label="([^"]+)"/)?.[1];
  const effects = [...body.matchAll(/<effect\b([^>]+)>([\s\S]*?)<\/effect>/g)];
  console.log(`EmbedScene ${i+1}: label="${label}", effects=${effects.length}`);
  for (const eff of effects) {
    const effId = eff[1].match(/id="([^"]+)"/)?.[1];
    const props = [...eff[2].matchAll(/<property\b([^>]+)>([\s\S]*?)<\/property>/g)];
    console.log(`  Effect: ${effId}, animated properties=${props.length}`);
    for (const p of props) {
      const pName = p[1].match(/name="([^"]+)"/)?.[1];
      const kfs = [...p[2].matchAll(/<kf\b([^>]+)\/>/g)];
      console.log(`    Property "${pName}": ${kfs.length} keyframes`);
      for (const k of kfs) console.log(`      kf: ${k[1]}`);
    }
  }
}
