const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\jeduc\\Downloads';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));
const easings = new Set();
const kfAttrs = new Set();
const tags = new Set();

for (const file of files) {
  try {
    const txt = fs.readFileSync(path.join(dir, file), 'utf8');
    const m = txt.matchAll(/\be="([^"]+)"/g);
    for (const match of m) easings.add(match[1]);

    const km = txt.matchAll(/<kf\b([^>]+)>/g);
    for (const match of km) {
      const attrs = match[1].matchAll(/(\w+)=/g);
      for (const a of attrs) kfAttrs.add(a[1]);
    }

    if (txt.includes('<graph') || txt.includes('<curve')) {
      console.log('File with graph/curve:', file);
    }
  } catch(e) {}
}

console.log('Unique easing formats (sample 30):');
console.log(Array.from(easings).slice(0, 30));
console.log('Unique kf attributes:');
console.log(Array.from(kfAttrs));
