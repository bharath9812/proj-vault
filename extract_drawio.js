const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'src', 'drawio_file.xml');
const publicDir = path.join(__dirname, 'public');

if (fs.existsSync(srcPath)) {
  const content = fs.readFileSync(srcPath, 'utf8');
  const matches = content.match(/data:image\/png,[^\"\']+/g);

  console.log('Found matches:', matches ? matches.length : 0);

  if (matches) {
    const sorted = matches.map((m, i) => ({ index: i, length: m.length, data: m }))
                           .sort((a, b) => b.length - a.length);

    console.log('Top 3 largest images:', sorted.slice(0, 3).map(s => ({ index: s.index, length: s.length })));

    if (sorted[0]) {
      const b64 = sorted[0].data.replace('data:image/png,', '').replace(/ /g, '+');
      fs.writeFileSync(path.join(publicDir, 'drawio_exact_1.png'), Buffer.from(b64, 'base64'));
      console.log('Saved drawio_exact_1.png');
    }
    if (sorted[1]) {
      const b64 = sorted[1].data.replace('data:image/png,', '').replace(/ /g, '+');
      fs.writeFileSync(path.join(publicDir, 'drawio_exact_2.png'), Buffer.from(b64, 'base64'));
      console.log('Saved drawio_exact_2.png');
    }
  }
}
